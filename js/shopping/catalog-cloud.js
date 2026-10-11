/* Firebase is authoritative for products. Apps Script stores a retryable backup. */
MiniTalk.Shopping=MiniTalk.Shopping||{};
MiniTalk.Shopping.CatalogCloud=(()=>{
  const root=MiniTalkConfig.paths.economyRuntime||"moaru/v3/economyRuntime";
  const catalogPath=`${root}/catalog`,pendingPath=`${root}/catalogBackupPending`;
  const obj=value=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  const key=id=>MiniTalk.Economy.Runtime.keyOf(id);
  let backupPromise=null;
  const cacheKey="shop.catalog.firebase.v1";
  let cached=null,stockCache=null,readPromise=null,generation=0,versionVerified=false;
  function requireCloud(){if(MiniTalk.Realtime.getMode()!=="firebase"){const e=new Error("Firebase 연결 후 상품 목록을 다시 확인해주세요.");e.code="CATALOG_FIREBASE_UNAVAILABLE";throw e;}}
  async function cloudRead(path,fallback=null){
    let timer;
    try{return await Promise.race([MiniTalk.Realtime.cloudGet(path,fallback),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error("Firebase 상품 조회 시간이 초과됐습니다.");e.code="CATALOG_TIMEOUT";reject(e);},20000);})]);}finally{clearTimeout(timer);}
  }
  async function publicRead(path){
    const base=String(MiniTalkConfig.firebase?.databaseURL||"").replace(/\/$/,"");
    if(!base)throw new Error("Firebase 주소를 확인해주세요.");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(`${base}/${path}.json`,{signal:controller.signal});if(!response.ok)throw new Error(`Firebase 상품 조회 실패 (${response.status})`);return await response.json();}finally{clearTimeout(timer);}
  }
  function rows(value,stock={}){
    if(value?.initialized!==true){const e=new Error("기존 상품의 Firebase 이전이 필요합니다.");e.code="CATALOG_MIGRATION_REQUIRED";throw e;}
    if(value.products!=null&&(typeof value.products!=="object"||Array.isArray(value.products)))throw new Error("Firebase 상품 목록 형식이 올바르지 않습니다.");
    return Object.values(obj(value.products)).map(product=>{
      if(!product?.id||!product.name||!Number.isFinite(Number(product.price))||Number(product.price)<=0)throw new Error("Firebase 상품 정보가 올바르지 않습니다.");
      const current=stock[key(product.id)];
      return {...product,...(current?{quantity:current.unlimited?null:current.qty}: {})};
    });
  }
  try{const saved=MiniTalk.Persistence.get(cacheKey,null);if(saved?.initialized===true&&saved.version!=null){rows(saved);cached=saved;}}catch(error){console.warn("Firebase 상품 기기 캐시 읽기 실패",error);}
  async function read(){
    const guest=MiniTalk.Store.get("user")?.isGuest===true;
    const publicGuest=guest&&MiniTalk.Realtime.getMode()!=="firebase";
    if(!publicGuest)requireCloud();if(readPromise)return readPromise;
    const epoch=generation;
    readPromise=(async()=>{
      const get=publicGuest?publicRead:cloudRead;
      if(cached&&(publicGuest||!versionVerified)){const version=await get(`${catalogPath}/version`);if(cached.version!==version)cached=null;versionVerified=true;}
      const [value,stock]=await Promise.all([cached?Promise.resolve(cached):get(catalogPath,null),!publicGuest&&stockCache?Promise.resolve(stockCache):get(`${root}/stock`,{})]);
      if(!publicGuest)requireCloud();const result=rows(value,obj(stock));
      if(epoch===generation){cached=value;stockCache=obj(stock);versionVerified=true;try{MiniTalk.Persistence.set(cacheKey,value);}catch(error){console.warn("Firebase 상품 기기 캐시 저장 실패",error);}}
      return result;
    })();
    try{return await readPromise;}finally{readPromise=null;}
  }
  async function change(action,product,userId){
    requireCloud();
    if(await MiniTalk.Realtime.cloudGet(`${catalogPath}/initialized`,false)!==true)throw new Error("기존 상품의 Firebase 이전이 필요합니다.");
    const stamp=MiniTalk.Realtime.serverTimestamp(),id=key(product.id),operation={id:crypto.randomUUID(),action,userId,product,createdAt:stamp};
    const patch={ [`catalog/products/${id}`]:action==="delete"?null:product, [`catalog/version`]:operation.id, [`catalogBackupPending/${id}`]:operation };
    if(action==="delete")patch[`stock/${id}`]=null;
    else {
      const stock=obj(await MiniTalk.Realtime.cloudGet(`${root}/stock/${id}`,null));
      patch[`stock/${id}`]={...stock,productId:String(product.id),qty:product.quantity??null,unlimited:product.quantity==null,catalogUpdatedAt:Number(product.updatedAt)||0,revision:(Number(stock.revision)||0)+1,updatedAt:Date.now()};
    }
    requireCloud();await MiniTalk.Realtime.cloudUpdate(root,patch);cached=null;stockCache=null;generation++;
  }
  async function flush(userId,token){
    requireCloud();if(backupPromise)return backupPromise;
    backupPromise=(async()=>{
      const pending=obj(await MiniTalk.Realtime.cloudGet(pendingPath,{}));
      for(const [id,operation] of Object.entries(pending)){
        const latest=await MiniTalk.Realtime.cloudGet(`${pendingPath}/${id}`,null);
        if(latest?.id!==operation.id)continue;
        if(operation.action==="delete")await MiniTalk.AuthApi.shopDeleteProduct(userId,token,operation.product.id,operation.createdAt);
        else await MiniTalk.AuthApi.shopSaveProduct(userId,token,operation.product,operation.createdAt);
        // Never acknowledge a newer edit/delete that arrived during this backup request.
        await MiniTalk.Realtime.cloudTransaction(`${pendingPath}/${id}`,live=>live?.id===operation.id?null:live);
      }
      return Object.keys(obj(await MiniTalk.Realtime.cloudGet(pendingPath,{}))).length;
    })();
    try{return await backupPromise;}finally{backupPromise=null;}
  }
  function subscribe(listener){
    requireCloud();
    const off=[MiniTalk.Realtime.cloudSubscribe(`${catalogPath}/version`,version=>{
      versionVerified=true;
      if(cached&&cached.version===version)return;
      cached=null;generation++;listener();
    }),MiniTalk.Realtime.cloudSubscribe(`${root}/stock`,stock=>{
      const next=obj(stock);if(stockCache&&JSON.stringify(stockCache)===JSON.stringify(next))return;
      stockCache=next;generation++;listener();
    })];
    return()=>off.forEach(stop=>stop());
  }
  return{read,change,flush,subscribe,rows,catalogPath,pendingPath};
})();
