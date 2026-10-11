/* Firebase products synchronize by field revision; Apps Script is a retryable backup. */
MiniTalk.Shopping=MiniTalk.Shopping||{};
MiniTalk.Shopping.CatalogCloud=(()=>{
  const root=MiniTalkConfig.paths.economyRuntime||"moaru/v3/economyRuntime";
  const catalogPath=`${root}/catalog`,pendingPath=`${root}/catalogBackupPending`;
  const obj=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const key=id=>MiniTalk.Economy.Runtime.keyOf(id);
  const cacheKey="shop.catalog.firebase.fields.v1";
  let cached=null,stockCache=null,index=null,indexVerified=false,schemaVerified=false,generation=0,readPromise=null,backupPromise=null,indexStreamReady=false,stockStreamReady=false;
  let schemaAvailable=false,repairNeeded=false,recoveryGeneration=-1,recoveryProducts=null;
  let productKeysVerified=false,knownProductKeys=null;
  function requireCloud(){if(MiniTalk.Realtime.getMode()!=="firebase"){const e=new Error("Firebase 연결 후 상품 목록을 다시 확인해주세요.");e.code="CATALOG_FIREBASE_UNAVAILABLE";throw e;}}
  async function cloudRead(path,fallback=null){let timer;try{return await Promise.race([MiniTalk.Realtime.cloudGet(path,fallback),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error("Firebase 상품 조회 시간이 초과됐습니다.");e.code="CATALOG_TIMEOUT";reject(e);},20000);})]);}finally{clearTimeout(timer);}}
  async function publicRead(path,fallback=null,shallow=false){
    const base=String(MiniTalkConfig.firebase?.databaseURL||"").replace(/\/$/,"");if(!base)throw new Error("Firebase 주소를 확인해주세요.");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(`${base}/${path}.json${shallow?"?shallow=true":""}`,{signal:controller.signal});if(!response.ok)throw new Error(`Firebase 상품 조회 실패 (${response.status})`);return await response.json();}finally{clearTimeout(timer);}
  }
  function publicSubscribe(path,receive,disconnected=()=>{}){
    const base=String(MiniTalkConfig.firebase?.databaseURL||"").replace(/\/$/,"");
    let source=null,timer=null,stopped=false,failures=0,value={};
    const assign=(parts,data)=>{if(!parts.length){value=data;return;}value=obj(value);let node=value;for(const part of parts.slice(0,-1)){if(["__proto__","constructor","prototype"].includes(part))throw new Error("잘못된 변경 경로");node[part]=obj(node[part]);node=node[part];}const last=parts[parts.length-1];if(["__proto__","constructor","prototype"].includes(last))throw new Error("잘못된 변경 경로");if(data==null)delete node[last];else node[last]=data;};
    const connect=()=>{
      if(stopped)return;source=new EventSource(`${base}/${path}.json`);
      const event=(kind,message)=>{try{const data=JSON.parse(message.data),parts=String(data.path||"/").split("/").filter(Boolean);if(kind==="put")assign(parts,data.data);else for(const [field,next]of Object.entries(obj(data.data)))assign([...parts,...field.split("/")],next);failures=0;receive(value);}catch(error){console.warn("Firebase 상품 변경 수신 실패",error);}};
      source.addEventListener("put",message=>event("put",message));source.addEventListener("patch",message=>event("patch",message));
      source.addEventListener("cancel",()=>{stopped=true;source.close();});
      source.onerror=()=>{source.close();disconnected();if(stopped)return;failures=Math.min(failures+1,5);timer=setTimeout(connect,[0,4000,12000,30000,60000,120000][failures]);};
    };
    connect();return()=>{stopped=true;source?.close();if(timer)clearTimeout(timer);};
  }
  function rows(value,stock={}){
    if(value?.initialized!==true){const e=new Error("기존 상품의 Firebase 이전이 필요합니다.");e.code="CATALOG_MIGRATION_REQUIRED";throw e;}
    return Object.values(obj(value.products)).map(product=>{
      if(!product?.id||!product.name||!Number.isFinite(Number(product.price))||Number(product.price)<=0)throw new Error("Firebase 상품 정보가 올바르지 않습니다.");
      const s=stock[key(product.id)];return {...product,...(s?{quantity:s.unlimited?null:s.qty}:{})};
    });
  }
  function validIndex(value){if(value!=null&&(typeof value!=="object"||Array.isArray(value)))throw new Error("Firebase 상품 변경 정보가 올바르지 않습니다.");const result=obj(value);for(const fields of Object.values(result))if(!fields||typeof fields!=="object"||Array.isArray(fields)||!fields.id||!fields.name||!fields.price)throw new Error("Firebase 상품 변경 정보가 올바르지 않습니다.");return result;}
  function rebuiltIndex(products,previous={}){
    const token=crypto.randomUUID(),result={};
    for(const [id,product]of Object.entries(products))result[id]=Object.fromEntries(Object.keys(product).map(field=>[field,previous[id]?.[field]||token]));
    return result;
  }
  // Only called through an authorized admin product operation. Never restore local/Apps backups.
  async function repairCatalog(){
    const value=await MiniTalk.Realtime.cloudTransaction(catalogPath,current=>{
      const catalog=obj(current),products=obj(catalog.products),previous=obj(catalog.itemVersions);
      rows({initialized:true,products});
      const complete=catalog.initialized===true&&catalog.fieldSchema===1&&Object.keys(products).length===Object.keys(previous).length&&Object.entries(products).every(([id,p])=>Object.keys(p).every(field=>previous[id]?.[field]));
      if(complete)return undefined;
      return {...catalog,initialized:true,schemaVersion:1,fieldSchema:1,empty:Object.keys(products).length===0,itemVersions:rebuiltIndex(products,previous),version:crypto.randomUUID()};
    },{applyLocally:false});
    rows(value);validIndex(value.itemVersions);
    cached={initialized:true,fieldSchema:1,products:obj(value.products),itemVersions:obj(value.itemVersions)};
    index=cached.itemVersions;indexVerified=true;schemaVerified=true;schemaAvailable=true;repairNeeded=false;recoveryProducts=null;recoveryGeneration=-1;persist();
  }
  function persist(){try{MiniTalk.Persistence.set(cacheKey,cached);}catch(error){console.warn("Firebase 상품 기기 캐시 저장 실패",error);}}
  try{
    let saved=MiniTalk.Persistence.get(cacheKey,null);
    if(!saved){const legacy=MiniTalk.Persistence.get("shop.catalog.firebase.v1",null);if(legacy?.initialized===true){rows(legacy);saved={...legacy,fieldSchema:1,itemVersions:legacy.fieldSchema===1?legacy.itemVersions:Object.fromEntries(Object.entries(obj(legacy.products)).map(([id,p])=>[id,Object.fromEntries(Object.keys(p).map(field=>[field,`initial:${p.updatedAt||0}`]))]))};}}
    if(saved?.initialized===true&&saved.fieldSchema===1){rows(saved);validIndex(saved.itemVersions);cached=saved;}
  }catch(error){console.warn("Firebase 상품 기기 캐시 읽기 실패",error);}
  async function read(){
    const publicGuest=MiniTalk.Store.get("user")?.isGuest===true&&MiniTalk.Realtime.getMode()!=="firebase";
    if(!publicGuest)requireCloud();if(readPromise)return readPromise;
    readPromise=(async()=>{
      const get=publicGuest?publicRead:cloudRead;
      if(!schemaVerified){const schema=await get(`${catalogPath}/fieldSchema`,null);if(schema!=null&&schema!==1){const e=new Error("지원하지 않는 상품 변경표 버전입니다.");e.code="CATALOG_FIELD_SCHEMA_REQUIRED";throw e;}schemaAvailable=schema===1;schemaVerified=true;}
      if((publicGuest&&!indexStreamReady)||!indexVerified){index=validIndex(await get(`${catalogPath}/itemVersions`,{}));indexVerified=true;}
      if(!productKeysVerified){
        const keyGeneration=generation;
        if(publicGuest)knownProductKeys=new Set(Object.keys(obj(await publicRead(`${catalogPath}/products`,null,true))));
        else if(MiniTalk.Realtime.cloudKeys)knownProductKeys=new Set(await MiniTalk.Realtime.cloudKeys(`${catalogPath}/products`));
        if(keyGeneration!==generation)knownProductKeys=null;
        productKeysVerified=true;
      }
      const epoch=generation;let target=JSON.parse(JSON.stringify(index||{}));
      let recovered=null;
      const orphanIds=knownProductKeys?Object.keys(target).filter(id=>!knownProductKeys.has(id)):[];
      for(const id of orphanIds)delete target[id];
      if(orphanIds.length)repairNeeded=true;
      if(!schemaAvailable||!Object.keys(target).length){
        // An absent index can mean either a deliberate empty shop or deleted metadata.
        // Probe the actual products once per index change, never the old device/Apps copy.
        if(recoveryGeneration!==epoch||recoveryProducts===null){
          const definitelyEmpty=knownProductKeys?knownProductKeys.size===0:(schemaAvailable&&await get(`${catalogPath}/empty`,false)===true);
          recoveryProducts=definitelyEmpty?{}:obj(await get(`${catalogPath}/products`,{}));rows({initialized:true,products:recoveryProducts});recoveryGeneration=epoch;
        }
        recovered=recoveryProducts;target=rebuiltIndex(recovered);
        repairNeeded=repairNeeded||!schemaAvailable||Object.keys(recovered).length>0;
      }
      const oldVersions=obj(cached?.itemVersions),next=recovered?{...recovered}:{...obj(cached?.products)};
      for(const id of Object.keys(next))if(!target[id])delete next[id];
      if(recovered){/* Already read the authoritative products for metadata recovery. */}
      else if(!cached&&Object.keys(target).length){
        // Initial installation needs all products once. Subsequent reads fetch changed fields only.
        const initial=obj(await get(`${catalogPath}/products`,{}));for(const id of Object.keys(target)){if(initial[id])next[id]=initial[id];else{delete next[id];delete target[id];repairNeeded=true;}}
      }else{
        const jobs=[];
        for(const [id,fields] of Object.entries(target)){
          if(!next[id]){jobs.push(async()=>{const value=await get(`${catalogPath}/products/${id}`,null);if(value==null){delete next[id];delete target[id];repairNeeded=true;}else next[id]=value;});continue;}
          const product={...next[id]};next[id]=product;
          for(const field of Object.keys(product))if(!fields[field])delete product[field];
          for(const [field,revision] of Object.entries(fields))if(oldVersions[id]?.[field]!==revision)jobs.push(async()=>{const value=await get(`${catalogPath}/products/${id}/${field}`,null);if(value==null)delete product[field];else product[field]=value;});
        }
        for(let i=0;i<jobs.length;i+=8)await Promise.all(jobs.slice(i,i+8).map(job=>job()));
        for(const id of Object.keys(target))if(!next[id]?.id){delete next[id];delete target[id];repairNeeded=true;}
      }
      const value={initialized:true,fieldSchema:1,products:next,itemVersions:target};rows(value);
      const stock=stockCache&&(!publicGuest||stockStreamReady)?stockCache:obj(await get(`${root}/stock`,{}));if(!publicGuest)requireCloud();
      const effectiveStock=publicGuest&&!stockStreamReady?stock:(stockCache||stock);
      if(epoch===generation){cached=value;stockCache=effectiveStock;persist();}
      return rows(value,effectiveStock);
    })();
    try{return await readPromise;}finally{readPromise=null;}
  }
  async function change(action,product,userId,requestedFields=null){
    requireCloud();await read();
    if(repairNeeded)await repairCatalog();
    const id=key(product.id),old=obj(cached?.products[id]),token=crypto.randomUUID(),stamp=MiniTalk.Realtime.serverTimestamp();
    const patch={},fields={...obj(cached?.itemVersions[id])},saved={...old};
    const allowed=Array.isArray(requestedFields)&&old.id?new Set(requestedFields):null;
    for(const [field,value]of Object.entries(product))if(!allowed||allowed.has(field)||field==="updatedAt"||field==="id")saved[field]=value;
    const stock=stockCache?.[id],effective=stock?(stock.unlimited?null:stock.qty):(old.quantity??null);
    const quantity=allowed&&!allowed.has("quantity")?effective:(saved.quantity??null);
    const operation={id:token,action,userId,product:action==="delete"?{id:String(product.id)}:{...saved,quantity},createdAt:stamp};
    if(action==="delete"){
      patch[`catalog/products/${id}`]=null;patch[`catalog/itemVersions/${id}`]=null;patch[`stock/${id}`]=null;
    }else{
      const changed=Object.keys(saved).filter(field=>field!=="updatedAt"&&(!allowed||allowed.has(field))&&!same(saved[field]??null,field==="quantity"?effective:(old[field]??null)));
      if(!changed.length&&old.id)return{changed:false,product:{...old,quantity:effective}};changed.push("updatedAt");
      for(const field of changed){patch[`catalog/products/${id}/${field}`]=saved[field]??null;patch[`catalog/itemVersions/${id}/${field}`]=token;fields[field]=token;}
      // A name/price/image edit must not reset live stock or resend its reservations.
      if(!old.id||!same(quantity,effective)){
        const live=obj(await cloudRead(`${root}/stock/${id}`,null));
        patch[`stock/${id}/productId`]=String(product.id);patch[`stock/${id}/qty`]=quantity;
        patch[`stock/${id}/unlimited`]=quantity==null;patch[`stock/${id}/catalogUpdatedAt`]=Number(saved.updatedAt)||0;
        patch[`stock/${id}/revision`]=(Number(live.revision)||0)+1;patch[`stock/${id}/updatedAt`]=stamp;
      }
    }
    patch["catalog/initialized"]=true;patch["catalog/schemaVersion"]=1;patch["catalog/fieldSchema"]=1;
    patch["catalog/empty"]=action==="delete"?Object.keys(obj(cached?.products)).every(existing=>existing===id):false;
    patch["catalog/version"]=token;patch[`catalogBackupPending/${id}`]=operation;
    requireCloud();await MiniTalk.Realtime.cloudUpdate(root,patch);
    if(knownProductKeys){if(action==="delete")knownProductKeys.delete(id);else knownProductKeys.add(id);}
    if(cached){cached={...cached,products:{...cached.products},itemVersions:{...cached.itemVersions}};if(action==="delete"){delete cached.products[id];delete cached.itemVersions[id];if(stockCache)delete stockCache[id];}else{const local={...old};for(const [field,revision]of Object.entries(fields))if(revision===token)local[field]=saved[field];cached.products[id]=local;cached.itemVersions[id]=fields;}persist();}
    indexVerified=false;return{changed:true,product:{...saved,quantity}};
  }
  async function flush(userId,token){
    requireCloud();if(backupPromise)return backupPromise;
    backupPromise=(async()=>{
      const pending=obj(await cloudRead(pendingPath,{}));
      if(!Object.keys(pending).length)return 0;
      for(const [id,operation] of Object.entries(pending)){
        if((await cloudRead(`${pendingPath}/${id}`,null))?.id!==operation.id)continue;
        if(operation.action==="delete")await MiniTalk.AuthApi.shopDeleteProduct(userId,token,operation.product.id,operation.createdAt);
        else await MiniTalk.AuthApi.shopSaveProduct(userId,token,operation.product,operation.createdAt);
        await MiniTalk.Realtime.cloudTransaction(`${pendingPath}/${id}`,live=>live?.id===operation.id?null:live);
      }
      return Object.keys(obj(await cloudRead(pendingPath,{}))).length;
    })();
    try{return await backupPromise;}finally{backupPromise=null;}
  }
  function subscribe(listener){
    const receiveIndex=value=>{
      // The small field-version index also reconciles deletions missed while the view was closed.
      const next=validIndex(value);if(value==null){schemaVerified=false;recoveryGeneration=-1;}indexVerified=true;if(same(index,next))return;index=JSON.parse(JSON.stringify(next));knownProductKeys=null;generation++;listener();
    };
    if(MiniTalk.Store.get("user")?.isGuest&&MiniTalk.Realtime.getMode()!=="firebase"){
      if(typeof EventSource!=="function")return()=>{indexVerified=false;stockCache=null;productKeysVerified=false;knownProductKeys=null;recoveryGeneration=-1;};
      const off=[publicSubscribe(`${catalogPath}/itemVersions`,value=>{indexStreamReady=true;receiveIndex(value);},()=>{indexStreamReady=false;}),publicSubscribe(`${root}/stock`,value=>{stockStreamReady=true;const next=obj(value);if(same(stockCache,next))return;stockCache=JSON.parse(JSON.stringify(next));listener();},()=>{stockStreamReady=false;})];
      return()=>{off.forEach(stop=>stop());indexStreamReady=false;stockStreamReady=false;indexVerified=false;stockCache=null;recoveryGeneration=-1;productKeysVerified=false;knownProductKeys=null;};
    }
    requireCloud();const off=[MiniTalk.Realtime.cloudSubscribe(`${catalogPath}/itemVersions`,receiveIndex)];
    const receive=(id,value)=>{stockCache=stockCache||{};if(same(stockCache[id]??null,value??null))return;if(value==null)delete stockCache[id];else stockCache[id]=value;listener();};
    off.push(MiniTalk.Realtime.cloudSubscribeChildren(`${root}/stock`,{added:receive,changed:receive,removed:id=>receive(id,null)}));
    return()=>{off.forEach(stop=>stop());indexVerified=false;stockCache=null;recoveryGeneration=-1;productKeysVerified=false;knownProductKeys=null;};
  }
  return{read,change,flush,subscribe,rows,catalogPath,pendingPath};
})();
