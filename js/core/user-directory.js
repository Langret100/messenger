/* 로그인 시트 가입자 명단과 Firebase 프로필을 합치는 공통 사용자 디렉터리입니다. */
MiniTalk.UserDirectory=(()=>{
  let loaded=false,inFlight=null,loadedAt=0;
  const object=value=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  const normalize=value=>{const id=String(value?.user_id||value?.userId||value?.uid||"").trim(),nickname=String(value?.nickname||value?.name||value?.username||id).trim();return id&&nickname?{...value,user_id:id,nickname}:null};
  const isGuest=value=>{const id=String(value?.user_id||value?.userId||value?.uid||""),username=String(value?.username||"");return Boolean(value?.isGuest)||/^guest-/i.test(id)||/^guest$/i.test(username)};
  function all(){const current=MiniTalk.Store.get("user")||{},map=new Map(),add=value=>{const item=normalize(value);if(!item||item.user_id===current.user_id||isGuest(item))return;const previous=map.get(item.user_id)||{};map.set(item.user_id,{...previous,...item,avatar:item.avatar||previous.avatar||""})};Object.values(object(MiniTalk.Store.get("userDirectory"))).forEach(add);Object.values(object(MiniTalk.Store.get("profiles"))).forEach(add);Object.values(object(MiniTalk.Store.get("presence"))).forEach(add);return[...map.values()].sort((a,b)=>a.nickname.localeCompare(b.nickname,"ko"))}
  async function refresh(force=false){const user=MiniTalk.Store.get("user")||{};if(!user.user_id||user.isGuest){loaded=true;MiniTalk.Store.set("userDirectory",{});return[]}if(!force&&loaded&&Date.now()-loadedAt<60000)return all();if(inFlight)return inFlight;inFlight=MiniTalk.AuthApi.userDirectory(user.user_id).then(rows=>{const directory={};rows.map(normalize).filter(Boolean).forEach(item=>directory[item.user_id]=item);loaded=true;loadedAt=Date.now();MiniTalk.Store.set("userDirectory",directory);return all()}).finally(()=>inFlight=null);return inFlight}
  function reset(){loaded=false;loadedAt=0;inFlight=null;MiniTalk.Store.set("userDirectory",{})}
  return{all,refresh,reset,isGuest,loaded:()=>loaded};
})();
