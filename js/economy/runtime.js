/* Firebase-first economy runtime. Sheets/Apps Script are backup/log only. */
MiniTalk.Economy=MiniTalk.Economy||{};
MiniTalk.Economy.Runtime=(()=>{
  const ROOT=MiniTalkConfig.paths.economyRuntime||"moaru/v3/economyRuntime", RETRY_TTL=7*86400000;
  let ownerId="",balanceOff=null,inventoryOff=null;const flushPromises=new Map();
  const obj=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
  const int=v=>(typeof v==="number"||typeof v==="string")&&String(v).trim()!==""&&Number.isSafeInteger(Number(v));
  const now=()=>Date.now();
  function keyOf(v){const s=unescape(encodeURIComponent(String(v||"")));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
  const userPath=id=>`${ROOT}/users/${keyOf(id)}`, balancePath=id=>`${ROOT}/balances/${keyOf(id)}`, activePath=id=>`${ROOT}/active/${keyOf(id)}`, stockPath=id=>`${ROOT}/stock/${keyOf(id)}`, inventoryPath=id=>`${ROOT}/inventory/${keyOf(id)}`;
  const opKey=v=>keyOf(String(v||"").slice(0,240)), itemKey=v=>keyOf(String(v||""));
  function assertFirebase(){if(MiniTalk.Realtime?.getMode?.()!=="firebase"){const e=new Error("실시간 서버 연결 후 이용할 수 있습니다.");e.code="ECONOMY_FIREBASE_UNAVAILABLE";throw e}}
  async function active(id){return (await MiniTalk.Realtime.cloudGet(activePath(id),false))===true}
  async function readUser(id){assertFirebase();return obj(await MiniTalk.Realtime.cloudGet(userPath(id),null))}
  const bootstrapPromises=new Map();
  async function ensureUserState(id){
    assertFirebase();id=String(id||"").trim();if(!id)return null;
    if(bootstrapPromises.has(id))return bootstrapPromises.get(id);
    const task=(async()=>{
      const current=await readUser(id);
      if(current.active&&int(current.balance))return current;

      // 기존 메신저의 코인 계정이 기준이다. Firebase 초기 이전 누락만으로
      // 정상 사용자를 NO_REWARD_USER 처리하지 않는다. 먼저 미러 잔액을 보고,
      // 미러도 없다면 기존 coin_status를 딱 한 번 조회해 지연 생성한다.
      let mirror=await MiniTalk.Realtime.cloudGet(balancePath(id),null);
      if(!mirror||!int(mirror.balance)){
        try{
          const legacy=await MiniTalk.AuthApi.coinStatus(id);
          if(!int(legacy))return null;
          mirror={userId:id,balance:Number(legacy),revision:1,updatedAt:now()};
        }catch(error){
          // 기존 보상 시트에도 실제 계정이 없는 경우만 예전과 동일하게 실패한다.
          if(error?.code==="NO_REWARD_USER"){
            const prepared=await ensureRegisteredRewardAccount(id);
            mirror={userId:id,balance:Number(prepared.coin)||0,revision:1,updatedAt:now()};
          }else throw error;
        }
      }
      const created=await MiniTalk.Realtime.cloudTransaction(userPath(id),value=>{
        const state=obj(value);if(state.active&&int(state.balance))return state;
        return{userId:id,active:true,balance:Number(mirror.balance),revision:Math.max(1,Number(mirror.revision)||1),updatedAt:Number(mirror.updatedAt)||now(),recentOps:obj(state.recentOps),pending:obj(state.pending)}
      });
      if(created&&created.active&&int(created.balance)){
        await Promise.all([
          MiniTalk.Realtime.cloudSet(activePath(id),true).catch(()=>{}),
          mirrorBalance(id,created).catch(()=>{})
        ]);
        return created;
      }
      return null;
    })();
    bootstrapPromises.set(id,task);
    try{return await task}finally{if(bootstrapPromises.get(id)===task)bootstrapPromises.delete(id)}
  }
  async function bootstrap(id){if(!id||MiniTalk.Realtime?.getMode?.()!=="firebase")return null;return ensureUserState(id)}
  async function ensureAdminRewardAccount(id){
    const current=MiniTalk.Store.get("user")||{};
    const token=MiniTalk.AdminSession?.requireToken?.("ADMIN");
    if(!current.user_id||!token){const e=new Error("관리자 인증이 필요합니다.");e.code="ADMIN_AUTH_REQUIRED";throw e}
    const body=new URLSearchParams({mode:"economy_admin_ensure_user",user_id:String(current.user_id),admin_token:String(token),target_user_id:String(id)});
    const response=await fetch(MiniTalkConfig.sheetUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body});
    if(!response.ok){const e=new Error(`서버 오류 ${response.status}`);e.code="ECONOMY_ACCOUNT_BOOTSTRAP_FAILED";throw e}
    const data=await response.json();
    if(!data?.ok){const e=new Error(data?.message||data?.error||"코인 계정을 준비하지 못했습니다.");e.code=data?.error||"ECONOMY_ACCOUNT_BOOTSTRAP_FAILED";throw e}
    return{coin:Number(data.coin)||0,userId:String(data.user_id||id),created:Boolean(data.created)};
  }
  async function ensureRegisteredRewardAccount(id){
    const body=new URLSearchParams({mode:"economy_ensure_user",user_id:String(id)});
    const response=await fetch(MiniTalkConfig.sheetUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body});
    if(!response.ok){const e=new Error(`서버 오류 ${response.status}`);e.code="ECONOMY_ACCOUNT_BOOTSTRAP_FAILED";throw e}
    const data=await response.json();
    if(!data?.ok){const e=new Error(data?.message||data?.error||"코인 계정을 준비하지 못했습니다.");e.code=data?.error||"ECONOMY_ACCOUNT_BOOTSTRAP_FAILED";throw e}
    return{coin:Number(data.coin)||0,userId:String(data.user_id||id),created:Boolean(data.created)};
  }
  async function ensureAdminTargetState(id){
    let state=await ensureUserState(id);
    if(state&&state.active&&int(state.balance))return state;

    // Apps Script에서 기존 코인 계정 존재/등록 사용자 여부를 확인한 결과를 받은 뒤에는
    // coin_status를 다시 조회하지 않습니다. 같은 요청 안에서 Firebase 상태를 직접 준비해
    // 시트 반영 직후 캐시/전파 지연 때문에 NO_REWARD_USER로 되돌아가는 경로를 제거합니다.
    const prepared=await ensureAdminRewardAccount(id),seedCoin=Number(prepared.coin)||0;
    state=await MiniTalk.Realtime.cloudTransaction(userPath(id),value=>{
      const current=obj(value);
      if(current.active&&int(current.balance))return current;
      return{...current,userId:String(id),active:true,balance:seedCoin,revision:Math.max(1,Number(current.revision)||1),updatedAt:now(),recentOps:obj(current.recentOps),pending:obj(current.pending)};
    });
    if(state&&state.active&&int(state.balance)){
      await Promise.all([MiniTalk.Realtime.cloudSet(activePath(id),true),mirrorBalance(id,state)]);
      return state;
    }
    const e=new Error("코인 계정을 준비하지 못했습니다.");e.code="ECONOMY_ACCOUNT_BOOTSTRAP_FAILED";throw e;
  }
  async function mirrorBalance(id,state){if(!id||!state||!int(state.balance))return;await MiniTalk.Realtime.cloudTransaction(balancePath(id),current=>{const c=obj(current),cr=Number(c.revision)||0,nr=Number(state.revision)||0;if(cr>nr)return c;return{userId:String(id),balance:Number(state.balance),revision:nr,updatedAt:Number(state.updatedAt)||now()}})}
  async function balance(id){if(!id||MiniTalk.Realtime?.getMode?.()!=="firebase")return null;const row=await MiniTalk.Realtime.cloudGet(balancePath(id),null);if(row&&int(row.balance))return Number(row.balance);const u=await ensureUserState(id);if(!u||!u.active||!int(u.balance))return null;await mirrorBalance(id,u).catch(()=>{});return Number(u.balance)}
  async function allBalances(){assertFirebase();const src=obj(await MiniTalk.Realtime.cloudGet(`${ROOT}/balances`,{})),out={};Object.values(src).forEach(r=>{if(r?.userId&&int(r.balance))out[String(r.userId)]=Number(r.balance)});return out}
  function pruneOps(source){const cutoff=now()-RETRY_TTL;const out={};Object.entries(obj(source)).forEach(([k,v])=>{if(v?.persistent||Number(v?.ts||0)>=cutoff)out[k]=v});return out}
  function appendPending(state,event){const pending={...obj(state.pending)},txn=String(event.txnId||crypto.randomUUID()).slice(0,240);pending[opKey(txn)]={...event,txnId:txn,createdAt:Number(event.createdAt)||now()};return pending}
  async function applyDelta({userId,amount,operationId,type="reward",reason="",meta={},allowNegative=false}){
    assertFirebase();userId=String(userId||"");const delta=Math.floor(Number(amount)),operation=String(operationId||crypto.randomUUID()).slice(0,240),encoded=opKey(operation);if(!userId||!Number.isSafeInteger(delta)||delta===0)throw new Error("INVALID_COIN_AMOUNT");
    const seed=await ensureUserState(userId);
    if(!seed||!seed.active||!int(seed.balance)){const e=new Error("NO_REWARD_USER");e.code="NO_REWARD_USER";throw e}
    let status="applied",after=null;const value=await MiniTalk.Realtime.cloudTransaction(userPath(userId),current=>{
      // Firebase transaction은 첫 호출에서 로컬 캐시가 비어 null을 줄 수 있다.
      // 이때 undefined를 반환하면 서버값 확인 전에 거래가 취소되므로, 방금 검증한 seed를 사용한다.
      let s=obj(current);if(!s.active||!int(s.balance))s={...obj(seed),userId:String(userId),active:true,recentOps:obj(seed.recentOps),pending:obj(seed.pending)};
      status="applied";after=null;
      const ops=pruneOps(s.recentOps);if(ops[encoded]){status="duplicate";after=s;return s}const before=Number(s.balance),next=before+delta;if(!allowNegative&&delta<0&&next<0){status="insufficient";after=s;return s}const revision=(Number(s.revision)||0)+1,ts=now();const persistent=String(type).includes("QUEST")||String(type).includes("WEEK")||String(type).includes("TASK")||String(type).includes("REWARD")||String(type).includes("ADMIN");ops[encoded]={type,amount:delta,ts,balanceAfter:next,reason:String(reason||"").slice(0,80),persistent,...meta};const n={...s,balance:next,revision,updatedAt:ts,lastTxnId:operation,recentOps:ops};n.pending=appendPending(n,{type:"coin",txnId:operation,eventType:type,amount:delta,reason:String(reason||"").slice(0,80),balance:next,revision,...meta});after=n;return n},{requireCommit:true});
    if(status==="insufficient"){const e=new Error("코인이 부족합니다.");e.code="INSUFFICIENT_COIN";throw e}const state=after||obj(value);if(!state.active||!int(state.balance))throw new Error("ECONOMY_TRANSACTION_FAILED");await Promise.all([MiniTalk.Realtime.cloudSet(activePath(userId),true).catch(()=>{}),mirrorBalance(userId,state)]);if(status==="applied")flushPending(userId).catch(()=>{});return{applied:status==="applied",duplicate:status==="duplicate",newCoin:Number(state.balance),revision:Number(state.revision)||0}
  }
  const reward=args=>applyDelta({userId:args.userId,amount:args.amount,operationId:`reward:${args.rewardType}:${args.rewardKey}:${args.userId}`,type:String(args.rewardType||"REWARD"),reason:args.reason,meta:{rewardKey:String(args.rewardKey||"").slice(0,120)}});
  async function adminAdjust({targets,amount,requestId,reason="관리자 코인 변경"}){
    assertFirebase();
    const ids=[...new Set((targets||[]).map(String).filter(Boolean))],delta=Math.floor(Number(amount)),issuer=String(MiniTalk.Store.get("user")?.user_id||"");
    if(!ids.length)throw new Error("NO_TARGETS");
    if(!Number.isSafeInteger(delta)||delta===0)throw new Error("INVALID_COIN_AMOUNT");

    // 기존 관리자 기능에서 이미 검증된 admin_user_balances를 초기 seed 원장으로 사용합니다.
    // 정상 사용자를 위해 새 economy_admin_ensure_user API를 매번 거치지 않습니다.
    // Firebase 상태가 없는 대상만 한 번 seed하고, 실제 증감은 아래 Firebase transaction에서 처리합니다.
    const existingById=new Map();
    await Promise.all(ids.map(async id=>{existingById.set(id,await readUser(id))}));
    const missingIds=ids.filter(id=>{const row=existingById.get(id)||{};return !(row.active&&int(row.balance))});
    const seedById=new Map();
    if(missingIds.length){
      const token=MiniTalk.AdminSession?.requireToken?.("ADMIN");
      const legacyRows=await MiniTalk.AuthApi.adminUserBalances(issuer,token);
      const legacyMap=new Map((legacyRows||[]).map(row=>[String(row.user_id||row.userId||""),Number(row.coin??row.balance)]));
      missingIds.forEach(id=>{const value=legacyMap.get(String(id));if(Number.isSafeInteger(value))seedById.set(String(id),value)});
      // 정말 보상 시트에도 없는 신규/복구 대상만 보조 API를 사용합니다.
      for(const id of missingIds){
        if(seedById.has(String(id)))continue;
        const prepared=await ensureAdminRewardAccount(id);
        seedById.set(String(id),Number(prepared.coin)||0);
      }
    }
    const adjustOne=async id=>{
      let seedCoin=null;
      const existing=existingById.get(id)||{};
      if(!(existing.active&&int(existing.balance)))seedCoin=seedById.get(String(id));
      const operation=`admin:${requestId}:${id}`,encoded=opKey(operation);
      let status="applied",after=null;
      const value=await MiniTalk.Realtime.cloudTransaction(userPath(id),current=>{
        let s=obj(current);
        if(!s.active||!int(s.balance)){
          if(seedCoin===null){status="missing";return undefined}
          s={...s,userId:String(id),active:true,balance:seedCoin,revision:Math.max(1,Number(s.revision)||1),updatedAt:now(),recentOps:obj(s.recentOps),pending:obj(s.pending)};
        }
        const ops=pruneOps(s.recentOps);
        if(ops[encoded]){status="duplicate";after=s;return s}
        const before=Number(s.balance),next=before+delta,revision=(Number(s.revision)||0)+1,ts=now();
        ops[encoded]={type:"ADMIN_COIN",amount:delta,ts,balanceAfter:next,reason:String(reason||"").slice(0,80),persistent:true,issuedBy:issuer,requestId:String(requestId||"")};
        const n={...s,userId:String(id),active:true,balance:next,revision,updatedAt:ts,lastTxnId:operation,recentOps:ops};
        n.pending=appendPending(n,{type:"coin",txnId:operation,eventType:"ADMIN_COIN",amount:delta,reason:String(reason||"").slice(0,80),balance:next,revision,issuedBy:issuer,requestId:String(requestId||"")});
        after=n;return n;
      });
      if(status==="missing"){const e=new Error("관리자 코인 대상 계정을 준비하지 못했습니다.");e.code="ECONOMY_ACCOUNT_BOOTSTRAP_FAILED";throw e}
      const state=after||obj(value);
      if(!state.active||!int(state.balance)){const e=new Error("관리자 코인 변경 결과를 확인하지 못했습니다.");e.code="ECONOMY_TRANSACTION_FAILED";throw e}
      await Promise.all([MiniTalk.Realtime.cloudSet(activePath(id),true),mirrorBalance(id,state)]);
      if(status==="applied")flushPending(id).catch(()=>{});
      return{user_id:id,newCoin:Number(state.balance),applied:status==="applied"};
    };

    const rows=[];
    for(let i=0;i<ids.length;i+=16)rows.push(...await Promise.all(ids.slice(i,i+16).map(adjustOne)));
    return{ok:true,count:rows.length,rewarded:rows};
  }
  function stockValue(p){return p.quantity==null?{unlimited:true,qty:null}:{unlimited:false,qty:Math.max(0,Math.floor(Number(p.quantity)||0))}}
  async function seedProduct(p,force=false){if(!p?.id||MiniTalk.Realtime?.getMode?.()!=="firebase")return null;const sv=stockValue(p),cat=Number(p.updatedAt)||0;return MiniTalk.Realtime.cloudTransaction(stockPath(p.id),cur=>{const s=obj(cur);if(!force&&Object.keys(s).length)return s;return{...s,productId:String(p.id),qty:sv.qty,unlimited:sv.unlimited,catalogUpdatedAt:cat,revision:(Number(s.revision)||0)+1,updatedAt:now()}})}
  async function seedCatalog(){return true}
  const setProductStock=p=>seedProduct(p,true);async function deleteProductStock(id){if(MiniTalk.Realtime?.getMode?.()==="firebase")await MiniTalk.Realtime.cloudRemove(stockPath(id))}
  async function reserveStock(product,purchaseKey){if(product.quantity==null)return{changed:false,remaining:null,revision:0};const rk=opKey(`purchase:${purchaseKey}`);let reason="",out=null;await MiniTalk.Realtime.cloudTransaction(stockPath(product.id),cur=>{let s=obj(cur);
    // 기존 상품의 Firebase 재고 노드가 setup에서 빠졌더라도 구매를 막지 않습니다.
    // 현재 카탈로그 재고를 transaction 내부의 최초값으로 사용하므로 동시 첫 구매도 직렬화됩니다.
    if(!Object.keys(s).length){const initialQty=Math.max(0,Math.floor(Number(product.quantity)||0));s={productId:String(product.id),qty:initialQty,unlimited:false,catalogUpdatedAt:Number(product.updatedAt)||0,revision:0,updatedAt:now(),reservations:{}}}
    if(s.unlimited){out=s;return s}const reservations=obj(s.reservations);if(reservations[rk]){out=s;return s}const qty=Math.floor(Number(s.qty)||0);if(qty<=0){reason="soldout";return undefined}out={...s,productId:String(product.id),qty:qty-1,unlimited:false,catalogUpdatedAt:Math.max(Number(s.catalogUpdatedAt)||0,Number(product.updatedAt)||0),revision:(Number(s.revision)||0)+1,updatedAt:now(),reservations:{...reservations,[rk]:{ts:now()}}};return out});if(reason==="soldout"){const e=new Error("품절된 상품입니다.");e.code="PRODUCT_SOLD_OUT";throw e}if(!out){const e=new Error("상품 재고 처리에 실패했습니다.");e.code="STOCK_TRANSACTION_FAILED";throw e}return{changed:true,remaining:Number(out.qty),revision:Number(out.revision)||0,reservationKey:rk}}
  async function finishReservation(productId,rk,rollback=false){if(!rk)return;await MiniTalk.Realtime.cloudTransaction(stockPath(productId),cur=>{const s=obj(cur),r=obj(s.reservations);if(!r[rk])return s;delete r[rk];return{...s,qty:rollback&&!s.unlimited?Math.max(0,Number(s.qty)||0)+1:s.qty,reservations:r,revision:(Number(s.revision)||0)+(rollback?1:0),updatedAt:now()}}).catch(()=>{})}
  const inventoryIdForPurchase=k=>`fb-${keyOf(String(k))}`;
  async function existingPurchase(uid,key){const row=await MiniTalk.Realtime.cloudGet(`${userPath(uid)}/recentOps/${opKey(`purchase:${key}`)}`,null);return row?.type==="purchase"?row:null}
  async function markInventoryReady(uid,key){if(!uid||!key)return;await MiniTalk.Realtime.cloudUpdate(`${userPath(uid)}/recentOps/${opKey(`purchase:${key}`)}`,{inventoryReady:true})}
  async function settlePurchaseItem(uid,item){const purchaseKey=String(item?.purchaseKey||"").trim();if(!uid||!purchaseKey)return;await markInventoryReady(uid,purchaseKey).catch(()=>{})}
  async function purchase({userId,product,purchaseKey,chargePrice,originalPrice=null,randomPurchase=false}){
    assertFirebase();const seed=await ensureUserState(userId);if(!seed||!seed.active||!int(seed.balance)){const e=new Error("코인 계정을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.");e.code="ECONOMY_ACCOUNT_BOOTSTRAP_FAILED";throw e}const prior=await existingPurchase(userId,purchaseKey);if(prior?.result){if(!prior.inventoryReady){const path=`${inventoryPath(userId)}/${itemKey(prior.item.id)}`,exists=await MiniTalk.Realtime.cloudGet(path,null);if(!exists)await MiniTalk.Realtime.cloudSet(path,prior.item);await markInventoryReady(userId,purchaseKey).catch(()=>{})}return{...prior.result,item:prior.item,applied:false,duplicate:true}}
    const stock=await reserveStock(product,purchaseKey),encoded=opKey(`purchase:${purchaseKey}`),inventoryId=inventoryIdForPurchase(purchaseKey);let status="applied",after=null,result=null;
    try{await MiniTalk.Realtime.cloudTransaction(userPath(userId),cur=>{
      // transaction 첫 호출이 null이어도 서버 상태 오류로 취급하지 않는다.
      let s=obj(cur);if(!s.active||!int(s.balance))s={...obj(seed),userId:String(userId),active:true,recentOps:obj(seed.recentOps),pending:obj(seed.pending)};
      status="applied";after=null;result=null;
      const ops=pruneOps(s.recentOps);if(ops[encoded]){status="duplicate";after=s;result=ops[encoded].result;return s}const before=Number(s.balance),price=Math.max(0,Math.floor(Number(chargePrice)||0));if(before<price){status="insufficient";after=s;return s}const revision=(Number(s.revision)||0)+1,ts=now(),item={id:inventoryId,ownerId:String(userId),productId:String(product.id),name:String(product.name||"상품"),description:String(product.description||""),imageUrl:String(product.imageUrl||""),price,originalPrice:Number(originalPrice??product.price)||price,purchaseKey:String(purchaseKey),purchasedAt:ts,createdAt:ts,deliveryStatus:"owned"};result={ok:true,applied:true,random_purchase:Boolean(randomPurchase),remaining_quantity:stock.remaining,stock_revision:stock.revision,product_id:String(product.id),product_name:item.name,product_description:item.description,product_image_url:item.imageUrl,product_updated_at:Number(product.updatedAt)||0,original_price:item.originalPrice,price,newCoin:before-price,item};ops[encoded]={type:"purchase",ts,productId:String(product.id),amount:-price,balanceAfter:result.newCoin,item,result,inventoryReady:false};const n={...s,balance:result.newCoin,revision,updatedAt:ts,lastTxnId:`purchase:${purchaseKey}`,recentOps:ops};n.pending=appendPending(n,{type:"purchase",txnId:`purchase:${purchaseKey}`,purchaseKey:String(purchaseKey),balance:result.newCoin,revision,coinBefore:before,item,productId:String(product.id),remainingQuantity:stock.remaining,stockRevision:stock.revision});after=n;return n},{requireCommit:true})}catch(error){const committed=await existingPurchase(userId,purchaseKey).catch(()=>null);if(!committed)await finishReservation(product.id,stock.reservationKey,true);throw error}
    if(status==="duplicate"){await finishReservation(product.id,stock.reservationKey,true);const p=await existingPurchase(userId,purchaseKey);return{...(p?.result||result),item:p?.item||result?.item,applied:false,duplicate:true}}
    if(status==="insufficient"){await finishReservation(product.id,stock.reservationKey,true);const e=new Error("코인이 부족합니다.");e.code="INSUFFICIENT_COIN";throw e}
    if(!result||!after){await finishReservation(product.id,stock.reservationKey,true);const e=new Error("구매 거래 상태를 확인하지 못했습니다. 다시 시도해주세요.");e.code="ECONOMY_TRANSACTION_FAILED";throw e}
    try{await MiniTalk.Realtime.cloudSet(`${inventoryPath(userId)}/${itemKey(result.item.id)}`,result.item);await markInventoryReady(userId,purchaseKey)}catch(e){console.warn("Firebase 보관함 기록 지연",e)}await finishReservation(product.id,stock.reservationKey,false);await Promise.all([MiniTalk.Realtime.cloudSet(activePath(userId),true).catch(()=>{}),mirrorBalance(userId,after)]);flushPending(userId).catch(()=>{});return result
  }
  function weightedPick(ps){const rows=ps.filter(p=>p?.id&&Number(p.price)>0&&!(p.quantity!=null&&Number(p.quantity)<=0));if(!rows.length)return null;const low=rows.filter(p=>Number(p.price)<=2),high=rows.filter(p=>Number(p.price)>2),group=low.length&&high.length?(Math.random()<.7?low:high):(low.length?low:high),w=p=>1/Math.max(1,Number(p.price)||1);let c=Math.random()*group.reduce((a,p)=>a+w(p),0);for(const p of group){c-=w(p);if(c<=0)return p}return group[group.length-1]}
  async function randomPurchase({userId,products,purchaseKey,price=3}){const prior=await existingPurchase(userId,purchaseKey);if(prior?.result)return{...prior.result,item:prior.item,applied:false,duplicate:true};const pool=[...(products||[])];while(pool.length){const p=weightedPick(pool);if(!p)break;try{return await purchase({userId,product:p,purchaseKey,chargePrice:price,originalPrice:p.price,randomPurchase:true})}catch(e){if(e?.code!=="PRODUCT_SOLD_OUT"&&e?.code!=="PRODUCT_NOT_AVAILABLE")throw e;const i=pool.findIndex(x=>x.id===p.id);if(i>=0)pool.splice(i,1)}}const e=new Error("추첨할 상품이 아직 없습니다.");e.code="NO_RANDOM_PRODUCTS";throw e}
  async function inventory(id){if(!id||MiniTalk.Realtime?.getMode?.()!=="firebase")return[];return Object.values(obj(await MiniTalk.Realtime.cloudGet(inventoryPath(id),{}))).filter(i=>i?.id)}
  async function patchInventory(uid,iid,patch){if(!uid||!iid||MiniTalk.Realtime?.getMode?.()!=="firebase")return;const path=`${inventoryPath(uid)}/${itemKey(iid)}`;const exists=await MiniTalk.Realtime.cloudGet(path,null);if(!exists){const e=new Error("INVENTORY_ITEM_NOT_FOUND");e.code="INVENTORY_ITEM_NOT_FOUND";throw e}await MiniTalk.Realtime.cloudUpdate(path,patch)}
  async function removeInventory(uid,iid){if(uid&&iid&&MiniTalk.Realtime?.getMode?.()==="firebase"){const path=`${inventoryPath(uid)}/${itemKey(iid)}`,item=await MiniTalk.Realtime.cloudGet(path,null);if(item)await settlePurchaseItem(uid,item);await MiniTalk.Realtime.cloudRemove(path)}}
  async function syncInventoryFromSheet(){return false}

  async function queueInventoryBackup(uid,event){
    if(!uid)return;await MiniTalk.Realtime.cloudTransaction(userPath(uid),cur=>{const st=obj(cur);if(!st.active)return st;st.pending=appendPending(st,{...event,type:"inventory",txnId:String(event.txnId||`inventory:${crypto.randomUUID()}`)});return st}).catch(()=>{});flushPending(uid).catch(()=>{})
  }
  async function useItem({userId,inventoryId,requestId}){
    assertFirebase();let out=null,reason="";await MiniTalk.Realtime.cloudTransaction(`${inventoryPath(userId)}/${itemKey(inventoryId)}`,cur=>{const item=obj(cur);if(!item.id){reason="missing";return undefined}if(item.usedAt){out=item;return item}const ts=now();out={...item,usedAt:ts,deliveryStatus:"completed",deliveryCompletedAt:ts};return out});if(reason){const e=new Error("사용할 수 없는 상품입니다.");e.code="INVENTORY_ITEM_NOT_FOUND";throw e}await queueInventoryBackup(userId,{txnId:`use:${requestId||inventoryId}`,action:"upsert",item:out});return{ok:true,usedAt:Number(out.usedAt),item:out}
  }
  async function requestDelivery({userId,inventoryId,requestId}){
    assertFirebase();let out=null,reason="";await MiniTalk.Realtime.cloudTransaction(`${inventoryPath(userId)}/${itemKey(inventoryId)}`,cur=>{const item=obj(cur);if(!item.id){reason="missing";return undefined}if(item.usedAt||item.deliveryStatus==="completed"){reason="completed";return undefined}if(item.deliveryStatus==="requested"||item.deliveryStatus==="shipping"){out=item;return item}const ts=now();out={...item,deliveryStatus:"requested",deliveryRequestedAt:ts};return out});if(reason){const e=new Error(reason==="completed"?"이미 배송이 완료된 상품입니다.":"배송 요청할 상품을 찾을 수 없습니다.");e.code=reason==="completed"?"DELIVERY_ALREADY_COMPLETED":"INVENTORY_ITEM_NOT_FOUND";throw e}await queueInventoryBackup(userId,{txnId:`delivery:${requestId||inventoryId}`,action:"upsert",item:out});return{ok:true,deliveryStatus:out.deliveryStatus,deliveryRequestedAt:out.deliveryRequestedAt,item:out}
  }
  async function requestDeliveryBulk({userId,inventoryIds,requestId}){const ids=[...new Set((inventoryIds||[]).map(String).filter(Boolean))].slice(0,20),items=[];for(const id of ids){const r=await requestDelivery({userId,inventoryId:id,requestId:`${requestId||"bulk"}:${id}`});items.push(r.item)}return{ok:true,count:items.length,items}}
  async function gift({userId,targetId,inventoryId,nickname,requestId}){
    assertFirebase();if(!await ensureUserState(targetId)){const e=new Error("선물할 사용자를 찾을 수 없습니다.");e.code="INVALID_GIFT_TARGET";throw e}const targetPath=`${inventoryPath(targetId)}/${itemKey(inventoryId)}`,sourcePath=`${inventoryPath(userId)}/${itemKey(inventoryId)}`,priorTarget=await MiniTalk.Realtime.cloudGet(targetPath,null);if(priorTarget?.giftRequestId===requestId)return{ok:true,item:priorTarget,duplicate:true};
    let marked=null,reason="";await MiniTalk.Realtime.cloudTransaction(sourcePath,cur=>{const item=obj(cur);if(!item.id){reason="missing";return undefined}if(item.usedAt||["completed","requested","shipping"].includes(item.deliveryStatus)){reason="blocked";return undefined}if(item.transferRequestId&&item.transferRequestId!==requestId){reason="conflict";return undefined}marked={...item,transferRequestId:String(requestId),transferTargetId:String(targetId)};return marked});if(reason){const e=new Error(reason==="missing"?"선물할 상품을 찾을 수 없습니다.":"선물할 수 없는 상품입니다.");e.code=reason==="conflict"?"GIFT_REQUEST_CONFLICT":"GIFT_ITEM_NOT_AVAILABLE";throw e}
    const ts=now(),gifted={...marked,ownerId:String(targetId),giftedBy:String(userId),giftedByNickname:String(nickname||""),giftedAt:ts,createdAt:ts,giftRequestId:String(requestId)};delete gifted.transferRequestId;delete gifted.transferTargetId;await MiniTalk.Realtime.cloudSet(targetPath,gifted);await settlePurchaseItem(userId,marked);await MiniTalk.Realtime.cloudRemove(sourcePath);await queueInventoryBackup(userId,{txnId:`gift:${requestId}`,action:"gift",item:gifted,sourceUserId:String(userId),targetUserId:String(targetId)});return{ok:true,item:gifted,targetId:String(targetId)}
  }
  async function deliveryList(){assertFirebase();const all=obj(await MiniTalk.Realtime.cloudGet(`${ROOT}/inventory`,{})),rows=[];Object.values(all).forEach(group=>Object.values(obj(group)).forEach(item=>{if(item?.id&&["requested","shipping"].includes(item.deliveryStatus))rows.push(item)}));return rows}
  async function adminDelivery({targets,status,requestId}){assertFirebase();const items=[];for(const t of targets||[]){const uid=String(t.ownerId||t.owner_id||""),iid=String(t.inventoryId||t.inventory_id||t.id||"");if(!uid||!iid)continue;let out=null;await MiniTalk.Realtime.cloudTransaction(`${inventoryPath(uid)}/${itemKey(iid)}`,cur=>{const item=obj(cur);if(!item.id)return undefined;const ts=now(),patch=status==="shipping"?{deliveryStatus:"shipping",deliveryShippingAt:ts}:status==="completed"?{deliveryStatus:"completed",deliveryCompletedAt:ts}:{deliveryStatus:"owned",deliveryRequestedAt:null,deliveryShippingAt:null};out={...item,...patch};return out});if(out){items.push(out);await queueInventoryBackup(uid,{txnId:`admin-delivery:${requestId||crypto.randomUUID()}:${iid}`,action:"upsert",item:out})}}return{ok:true,count:items.length,items}}
  async function flushPending(uid){if(!uid||MiniTalk.Realtime?.getMode?.()!=="firebase")return;uid=String(uid);if(flushPromises.has(uid))return flushPromises.get(uid);const p=(async()=>{const pending=obj(await MiniTalk.Realtime.cloudGet(`${userPath(uid)}/pending`,{}));for(const [k,event] of Object.entries(pending)){try{await MiniTalk.AuthApi.economySheetSync({userId:uid,event});await MiniTalk.Realtime.cloudRemove(`${userPath(uid)}/pending/${k}`)}catch(e){console.warn("경제 시트 pending 유지",event?.type,e);break}}})();flushPromises.set(uid,p);try{await p}finally{if(flushPromises.get(uid)===p)flushPromises.delete(uid)}}
  function start(user=MiniTalk.Store.get("user")){stop();if(!user?.user_id||user.isGuest)return;ownerId=String(user.user_id);const attach=()=>{if(MiniTalk.Realtime?.getMode?.()!=="firebase"||!ownerId)return;balanceOff=MiniTalk.Realtime.cloudSubscribe(balancePath(ownerId),r=>{if(r&&int(r.balance)&&String(MiniTalk.Store.get("user")?.user_id||"")===ownerId)MiniTalk.Economy.CoinWallet?.setLocal?.(Number(r.balance),"firebase-live",ownerId)});inventoryOff=MiniTalk.Realtime.cloudSubscribe(inventoryPath(ownerId),v=>{if(String(MiniTalk.Store.get("user")?.user_id||"")===ownerId)MiniTalk.Events.emit("economy:inventory",obj(v))});flushPending(ownerId).catch(()=>{})};if(MiniTalk.Realtime?.getMode?.()==="firebase")attach();else{const off=MiniTalk.Events.on("state:transport",()=>{if(MiniTalk.Realtime?.getMode?.()==="firebase"){off?.();attach()}})}}
  function stop(){try{balanceOff?.()}catch{}try{inventoryOff?.()}catch{}balanceOff=inventoryOff=null;ownerId=""}
  return{ROOT,keyOf,bootstrap,balance,allBalances,reward,adminAdjust,seedCatalog,setProductStock,deleteProductStock,purchase,randomPurchase,inventory,patchInventory,removeInventory,syncInventoryFromSheet,useItem,requestDelivery,requestDeliveryBulk,gift,deliveryList,adminDelivery,flushPending,start,stop,_ensureUserState:ensureUserState};
})();
