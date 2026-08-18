/* 상품 카탈로그·구매·보관함·선물의 서버 동기화를 UI에서 분리합니다. */
MiniTalk.Shopping = MiniTalk.Shopping || {};
MiniTalk.Shopping.StoreService = (() => {
  const USED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;
  const CATALOG_CACHE_KEY = "shop.catalog.cache.v2";
  const objectValue = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  let catalogPromise = null, catalogLoadedAt = 0, inventoryPromise = null, pollTimer = 0, activeUserId = "";

  function user() { return MiniTalk.Store.get("user") || {}; }
  function requireLogin() { const current=user();if(!current.user_id||current.isGuest)throw new Error("로그인 후 이용할 수 있어요.");return current; }
  function normalizeProduct(product={}) { return { id:String(product.id||""),name:String(product.name||"").trim().slice(0,60),description:String(product.description||"").trim().slice(0,160),imageUrl:String(product.imageUrl||product.image_url||"").trim().slice(0,7200),price:Math.max(1,Math.floor(Number(product.price)||0)),updatedAt:Number(product.updatedAt)||0 }; }
  function normalizeInventory(item={}) { const product=objectValue(MiniTalk.Store.get("shopCatalog"))[item.productId]||{};return{...item,id:String(item.id||""),productId:String(item.productId||""),name:item.name||product.name||"상품",description:item.description||product.description||"",imageUrl:item.imageUrl||product.imageUrl||"",price:Number(item.price||product.price)||0}; }

  function writeCatalog(catalog) { const current=objectValue(MiniTalk.Store.get("shopCatalog"));if(sameValue(current,catalog))return false;MiniTalk.Store.set("shopCatalog",catalog);MiniTalk.Persistence.set(CATALOG_CACHE_KEY,catalog);return true; }
  function hydrateCatalogCache() { const cached=objectValue(MiniTalk.Persistence.get(CATALOG_CACHE_KEY,{}));if(Object.keys(cached).length&&!Object.keys(objectValue(MiniTalk.Store.get("shopCatalog"))).length)MiniTalk.Store.set("shopCatalog",cached); }
  hydrateCatalogCache();

  // Firebase 호환 보관함과 Apps Script 보관함을 합쳐 기존 구매품을 잃지 않습니다.
  MiniTalk.Events.on("rt:shop-inventory", value=>{const current=objectValue(MiniTalk.Store.get("shopInventory")),merged={...current,...objectValue(value)};if(!sameValue(current,merged))MiniTalk.Store.set("shopInventory",merged)});

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
    const local=objectValue(MiniTalk.Store.get("shopInventory")),pending=Object.fromEntries(Object.entries(local).filter(([,item])=>item?.pendingSync));
    const merged={...pending,...server},previous=objectValue(MiniTalk.Store.get("shopInventory"));if(!sameValue(previous,merged)){MiniTalk.Store.set("shopInventory",merged);MiniTalk.Persistence.set(inventoryCacheKey(current.user_id),merged)}
    const seen=new Set(MiniTalk.Persistence.get(seenGiftKey(current.user_id),[])||[]);let changed=false;
    Object.values(server).filter(item=>item.giftedAt&&!seen.has(item.id)).forEach(item=>{seen.add(item.id);changed=true;MiniTalk.Tools.Notifications?.notifyGift?.(item)});
    if(changed)MiniTalk.Persistence.set(seenGiftKey(current.user_id),[...seen].slice(-300));
    return inventory();
  }
  async function refreshInventory(force=false) {
    const current=user();if(!current.user_id||current.isGuest)return[];
    if(!force&&inventoryPromise)return inventoryPromise;
    inventoryPromise=MiniTalk.AuthApi.shopInventory(current.user_id).then(rows=>publishInventory(rows,current)).finally(()=>{inventoryPromise=null});
    return inventoryPromise;
  }
  function start(current=user()) {
    hydrateCatalogCache();refreshCatalog(true).catch(error=>console.warn("상품 목록 미리 불러오기 실패",error));
    if(!current.user_id||current.isGuest)return;
    if(activeUserId!==current.user_id){clearInterval(pollTimer);pollTimer=0;activeUserId=current.user_id;const cached=objectValue(MiniTalk.Persistence.get(inventoryCacheKey(activeUserId),{}));if(Object.keys(cached).length)MiniTalk.Store.set("shopInventory",cached)}
    refreshInventory(true).catch(error=>console.warn("보관함 미리 불러오기 실패",error));
    if(!pollTimer)pollTimer=setInterval(()=>refreshInventory(true).catch(()=>{}),15000);
  }

  async function saveProduct(product) { const current=requireLogin(),value=normalizeProduct({...product,id:product?.id||crypto.randomUUID(),updatedAt:Date.now()});if(!value.name||value.price<=0)throw new Error("상품 이름과 가격을 입력하세요.");const result=await MiniTalk.AuthApi.shopSaveProduct(current.user_id,MiniTalk.AdminSession.requireToken(),value),saved=normalizeProduct({...value,...(result.product||{}),imageUrl:result.product?.imageUrl||result.product?.image_url||value.imageUrl});writeCatalog({...objectValue(MiniTalk.Store.get("shopCatalog")),[saved.id]:saved});catalogLoadedAt=Date.now();return saved; }
  async function deleteProduct(id) { const current=requireLogin();await MiniTalk.AuthApi.shopDeleteProduct(current.user_id,MiniTalk.AdminSession.requireToken(),id);const catalog={...objectValue(MiniTalk.Store.get("shopCatalog"))};delete catalog[id];writeCatalog(catalog);catalogLoadedAt=Date.now(); }
  function inventory(now=Date.now()) { return Object.values(objectValue(MiniTalk.Store.get("shopInventory"))).map(normalizeInventory).filter(item=>!item.usedAt||now-Number(item.usedAt)<USED_VISIBLE_MS).sort((a,b)=>Number(b.createdAt||b.giftedAt||0)-Number(a.createdAt||a.giftedAt||0)); }
  function usedRemainingDays(item,now=Date.now()){return item?.usedAt?Math.max(0,Math.ceil((USED_VISIBLE_MS-(now-Number(item.usedAt)))/86400000)):0}
  function recipients(){return MiniTalk.UserDirectory?.all?.()||[]}

  async function purchase(product) {
    const current=requireLogin(),item=normalizeProduct(product);if(!item.id||!item.name||!item.price)throw new Error("구매할 상품 정보가 올바르지 않습니다.");
    const purchaseKey=`${current.user_id}:${item.id}:${crypto.randomUUID()}`;
    let result;
    try {
      // 별도 사전 조회 없이 기존 구매 요청에 화면의 상품 개정 정보를 함께 보냅니다.
      result=await MiniTalk.AuthApi.shopPurchase({userId:current.user_id,product:item,purchaseKey});
    } catch(error) {
      if(["PRODUCT_CHANGED","PRICE_CHANGED","PRODUCT_NOT_AVAILABLE"].includes(error?.code)) {
        await refreshCatalog(true).catch(()=>{});
        error.productChanged=true;
      }
      throw error;
    }
    const stored=result.item||{productId:item.id,name:item.name,description:item.description,imageUrl:item.imageUrl,price:item.price,purchaseKey,purchasedAt:Date.now(),createdAt:Date.now()};
    await MiniTalk.Realtime.addShopInventory(current.user_id,stored);await refreshInventory(true).catch(()=>{});
    const balance=result.newCoin??result.coin??result.balance;if(balance!=null)MiniTalk.Economy.CoinWallet.setLocal(balance,"purchase");else await MiniTalk.Economy.CoinWallet.refresh(true);return result;
  }
  async function use(id) { const current=requireLogin(),item=inventory().find(row=>row.id===id);if(!item||item.usedAt)throw new Error("사용할 수 없는 상품입니다.");const result=await MiniTalk.AuthApi.shopUse({userId:current.user_id,inventoryId:id,item});try{await MiniTalk.Realtime.useShopInventory(id)}catch(error){console.warn("Firebase 보관함 사용 상태 동기화 실패",error)}await refreshInventory(true);return result.usedAt; }
  async function gift(id,targetId) { const current=requireLogin(),item=inventory().find(row=>row.id===id);if(!item||item.usedAt)throw new Error("선물할 수 없는 상품입니다.");const target=recipients().find(row=>row.user_id===targetId);if(!target)throw new Error("선물할 사용자를 찾을 수 없습니다.");await MiniTalk.AuthApi.shopGift({userId:current.user_id,nickname:current.nickname,targetId:target.user_id,inventoryId:id,item});const currentItems={...objectValue(MiniTalk.Store.get("shopInventory"))};delete currentItems[id];MiniTalk.Store.set("shopInventory",currentItems);MiniTalk.Persistence.set(inventoryCacheKey(current.user_id),currentItems);await refreshInventory(true);return{targetId:target.user_id,targetNickname:target.nickname}; }

  return{products,refreshCatalog,refreshInventory,start,saveProduct,deleteProduct,inventory,recipients,purchase,use,gift,normalizeProduct,usedRemainingDays,requireLogin,USED_VISIBLE_MS};
})();
