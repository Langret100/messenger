/* A tiny server generation distinguishes a data reset from ordinary empty lists. */
MiniTalk.ServerGeneration=(()=>{
  const KEY="miniTalk.v3.serverGeneration",PATH="moaru/v3/economyRuntime/deviceGeneration";
  const owned=key=>key.startsWith("miniTalk.v3.")||key.startsWith("chat.roomGames.")||key==="admin.pendingCoinRequests.v1";
  let activeGeneration=null,checking=null;
  const saved=()=>{try{return localStorage.getItem(KEY)}catch{return null}};
  function clearStorage(storage){const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&owned(key))keys.push(key)}for(const key of keys)storage.removeItem(key)}
  async function request(path,{method="GET",etag=false,match,body,shallow=false}={}){
    const base=String(MiniTalkConfig.firebase?.databaseURL||"").replace(/\/$/,"");
    if(!base)return null;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const headers={};if(etag)headers["X-Firebase-ETag"]="true";if(match)headers["if-match"]=match;if(body!==undefined)headers["Content-Type"]="application/json";
      const response=await fetch(`${base}/${path}.json${shallow?"?shallow=true":""}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:"no-store"});
      if(response.status===412)return{conflict:true};
      if(!response.ok)throw Error(`초기화 상태 확인 실패 (${response.status})`);
      return{value:await response.json(),etag:response.headers.get("ETag")};
    }finally{clearTimeout(timer)}
  }
  async function checkOnce(){
    if(!MiniTalkConfig.firebase?.databaseURL||!MiniTalkConfig.firebase?.apiKey)return false;
    const previous=saved();let response=await request(PATH),generation=response.value,emptyFoundation=false;
    // Normal boots use a plain GET; ETag/preflight is only needed for the rare creation.
    if(generation===null){response=await request(PATH,{etag:true});generation=response.value}
    if(generation===null){
      // Only the first installation needs this legacy baseline check. Root reads are denied by the rules.
      if(!previous){const [rooms,runtime]=await Promise.all([request("rooms",{shallow:true}),request("moaru/v3/economyRuntime",{shallow:true})]);emptyFoundation=rooms.value===null&&runtime.value===null}
      if(!response.etag)throw Error("초기화 식별값의 동시 저장을 확인할 수 없습니다.");
      const created=crypto.randomUUID(),write=await request(PATH,{method:"PUT",match:response.etag,body:created});
      generation=write.conflict?(await request(PATH)).value:write.value;
    }
    if(typeof generation!=="string"||!generation||generation.length>128)throw Error("초기화 식별값이 올바르지 않습니다.");
    const reset=Boolean(previous&&previous!==generation)||emptyFoundation;
    if(reset){
      // Clear the shared IndexedDB before committing the local generation; failures remain retryable.
      await MiniTalk.DataCache.clearAll();clearStorage(localStorage);clearStorage(sessionStorage);
    }
    localStorage.setItem(KEY,generation);activeGeneration=generation;
    if(reset){location.reload();return true}
    return false;
  }
  function check(){return checking||(checking=checkOnce().catch(error=>{console.warn("서버 초기화 확인 지연",error);return false}))}
  addEventListener("storage",event=>{
    if(event.key!==KEY||!event.newValue||!activeGeneration||event.newValue===activeGeneration)return;
    // Another tab has already cleared the shared caches. This tab still has private session/memory state.
    clearStorage(sessionStorage);MiniTalk.Realtime?.cleanup?.();location.reload();
  });
  return{check};
})();
