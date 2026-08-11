/* ============================================================
   실시간 통신 어댑터
   - 외부 Firebase SDK는 실제 키가 있을 때만 지연 로드합니다.
   - 기능 모듈은 Firebase/localStorage를 직접 호출하지 않습니다.
   - 재로그인·재진입 시 기존 구독과 타이머를 반드시 정리합니다.
   ============================================================ */
MiniTalk.Realtime=(()=>{
  let mode="idle",db=null,user=null,channel=null,heartbeat=null,storageHandler=null,presenceRef=null;
  let messageUnsub=null;
  const unsubs=[];
  const handledCommands=new Set();
  const localPrefix="miniTalk.v3.data.";

  const validKey=()=>{const k=MiniTalkConfig.firebase.apiKey;return Boolean(k&&!k.includes("__FIREBASE")&&k.length>20)};
  const emit=(type,data)=>MiniTalk.Events.emit(`rt:${type}`,data);
  const localGet=(key,fallback={})=>{try{const raw=localStorage.getItem(localPrefix+key);if(raw===null)return fallback;const parsed=JSON.parse(raw);if(Array.isArray(fallback))return Array.isArray(parsed)?parsed:fallback;if(fallback&&typeof fallback==="object"&&!Array.isArray(fallback))return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:fallback;return parsed??fallback}catch{return fallback}};
  const localSet=(key,value)=>{try{localStorage.setItem(localPrefix+key,JSON.stringify(value))}catch(error){if(error?.name==="QuotaExceededError")throw new Error("이 기기의 로컬 저장 공간이 부족합니다.");throw error}};
  const localRemove=key=>{try{localStorage.removeItem(localPrefix+key)}catch{}};
  const memberValue=(role="member")=>({user_id:user.user_id,nickname:user.nickname,role,joinedAt:Date.now()});
  const roomMembers=room=>room?.members&&typeof room.members==="object"&&!Array.isArray(room.members)?room.members:{};
  const isRoomMember=room=>room?.id==="global"||Boolean(roomMembers(room)[user?.user_id]);
  async function passwordHash(password,salt){
    if(!crypto?.subtle||typeof TextEncoder==="undefined")throw new Error("이 브라우저에서는 대화방 비밀번호를 사용할 수 없습니다.");
    const bytes=new TextEncoder().encode(`${salt}:${password}`),digest=await crypto.subtle.digest("SHA-256",bytes);
    return[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("")
  }
  function passwordSalt(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return[...bytes].map(v=>v.toString(16).padStart(2,"0")).join("")}

  function addScript(src){return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.src===src);if(existing){if(window.firebase)return resolve();existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true});return}const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error(`SDK 로드 실패: ${src}`));document.head.append(script)})}
  async function loadFirebase(){if(window.firebase?.database)return;await addScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");await addScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js")}
  function waitForConnected(database,timeout=7000){return new Promise((resolve,reject)=>{const ref=database.ref(".info/connected");const timer=setTimeout(()=>{ref.off("value",onValue);reject(new Error("Firebase 연결 시간 초과"))},timeout);function onValue(s){if(s.val()===true){clearTimeout(timer);ref.off("value",onValue);resolve()}}ref.on("value",onValue)})}

  function bind(ref,event,fn){ref.on(event,fn);const off=()=>ref.off(event,fn);unsubs.push(off);return off}
  function cleanup(){
    const previousUser=user;
    messageUnsub?.();messageUnsub=null;
    while(unsubs.length){try{unsubs.pop()()}catch{}}
    if(heartbeat){clearInterval(heartbeat);heartbeat=null}
    if(storageHandler){removeEventListener("storage",storageHandler);storageHandler=null}
    if(channel){channel.close();channel=null}
    if(mode==="firebase"&&presenceRef){presenceRef.update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{});presenceRef=null}
    if(mode==="local"&&previousUser?.user_id){try{const all=localGet("presence",{});if(all[previousUser.user_id]){all[previousUser.user_id].online=false;all[previousUser.user_id].lastSeen=Date.now();localSet("presence",all)}}catch{}}
    handledCommands.clear();
  }

  function makePacket(type,data){return{type,data,id:crypto.randomUUID(),at:Date.now()}}
  function broadcast(type,data){const packet=makePacket(type,data);if(channel)channel.postMessage(packet);else localStorage.setItem(localPrefix+"pulse",JSON.stringify(packet));handleLocal(packet)}
  function handleLocal(packet){
    if(!packet?.type)return;
    const {type,data}=packet;
    if(type==="message")emit("message",data);
    else if(type==="rooms")emit("rooms",data);
    else if(type==="presence")emit("presence",data);
    else if(type==="profiles")emit("profiles",data);
    else if(type==="shop-inventory"&&data.target===user?.user_id)emit("shop-inventory",localGet(`shop.inventory.${user.user_id}`,{}));
    else if(type==="task"&&data.target===user?.user_id)emit("tasks",localGet(`tasks.${user.user_id}`,{}));
    else if(type==="command"&&data.target===user?.user_id){const cmd=data.command;if(cmd?.id&&!handledCommands.has(cmd.id)){handledCommands.add(cmd.id);emit("command",cmd)}}
  }

  async function init(nextUser){
    cleanup();user=nextUser;db=null;mode="local";
    if(validKey()){
      try{await loadFirebase();if(!firebase.apps.length)firebase.initializeApp(MiniTalkConfig.firebase);db=firebase.database();await waitForConnected(db);mode="firebase"}
      catch(error){console.warn("Firebase 연결 실패, 로컬 모드로 전환",error);db=null;mode="local"}
    }
    MiniTalk.Store.set("transport",mode);
    if(mode==="firebase")await startFirebase();else await startLocal();
    return mode;
  }

  async function startFirebase(){
    presenceRef=db.ref(`${MiniTalkConfig.paths.presence}/${user.user_id}`);
    await presenceRef.set({user_id:user.user_id,nickname:user.nickname,online:true,lastSeen:firebase.database.ServerValue.TIMESTAMP});
    presenceRef.onDisconnect().update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP});
    bind(db.ref(MiniTalkConfig.paths.rooms),"value",s=>emit("rooms",s.val()||{}));
    bind(db.ref(MiniTalkConfig.paths.presence),"value",s=>emit("presence",s.val()||{}));
    bind(db.ref(MiniTalkConfig.paths.profiles),"value",s=>emit("profiles",s.val()||{}));
    bind(db.ref(`${MiniTalkConfig.paths.shopInventory}/${user.user_id}`),"value",s=>emit("shop-inventory",s.val()||{}));
    bind(db.ref(`${MiniTalkConfig.paths.tasks}/${user.user_id}`),"value",s=>emit("tasks",s.val()||{}));
    bind(db.ref(`${MiniTalkConfig.paths.commands}/${user.user_id}`).limitToLast(30),"child_added",async s=>{
      const value=s.val()||{};if(value.status==="done"||handledCommands.has(s.key))return;
      handledCommands.add(s.key);emit("command",{id:s.key,...value});
      try{await s.ref.update({status:"done",handledAt:firebase.database.ServerValue.TIMESTAMP})}catch(error){console.warn("명령 처리 표시 실패",error)}
    });
    await ensureDefaultRoom();
  }

  async function startLocal(){
    if("BroadcastChannel" in window){channel=new BroadcastChannel("mini-talk-v3");channel.onmessage=e=>handleLocal(e.data)}
    else{storageHandler=e=>{if(e.key===localPrefix+"pulse"&&e.newValue){try{handleLocal(JSON.parse(e.newValue))}catch{}}};addEventListener("storage",storageHandler)}
    await ensureDefaultRoom();updatePresence();heartbeat=setInterval(updatePresence,15000);
    emit("rooms",localGet("rooms",{}));emit("profiles",localGet("profiles",{}));emit("tasks",localGet(`tasks.${user.user_id}`,{}));emit("shop-inventory",localGet(`shop.inventory.${user.user_id}`,{}));
  }

  async function ensureDefaultRoom(){
    const room={id:"global",title:"전체 대화",type:"group",updatedAt:Date.now(),lastMessage:""};
    if(mode==="firebase"){const ref=db.ref(`${MiniTalkConfig.paths.rooms}/global`);const snap=await ref.once("value");if(!snap.exists()){await ref.set(room);MiniTalk.Chat.ServerBackup?.room("CREATE",room)}}
    else{const rooms=localGet("rooms",{});if(!rooms.global){rooms.global=room;localSet("rooms",rooms)}}
  }
  function updatePresence(){const all=localGet("presence",{}),now=Date.now();for(const id of Object.keys(all))all[id].online=Boolean(all[id].online&&now-(all[id].lastSeen||0)<45000);all[user.user_id]={user_id:user.user_id,nickname:user.nickname,online:true,lastSeen:now};localSet("presence",all);broadcast("presence",all)}

  function unsubscribeMessages(){messageUnsub?.();messageUnsub=null}
  async function subscribeMessages(roomId){
    unsubscribeMessages();emit("message-reset",roomId);
    if(mode==="firebase"){
      const ref=db.ref(`${MiniTalkConfig.paths.messages}/${roomId}`).orderByChild("ts").limitToLast(100);
      const fn=s=>{const value=s.val()||{};emit("message",{...value,id:s.key,roomId:value.roomId||roomId})};
      ref.on("child_added",fn);messageUnsub=()=>ref.off("child_added",fn);
    }else localGet(`messages.${roomId}`,[]).slice(-100).forEach(message=>emit("message",message));
  }
  async function sendMessage(roomId,payload){
    payload=payload||{};
    const message={
      roomId,user_id:user.user_id,nickname:user.nickname,
      type:payload.type||(payload.fileUrl?"file":(payload.image||payload.imageUrl?"image":"text")),
      text:payload.text||"",image:payload.image||null,imageUrl:payload.imageUrl||null,
      fileUrl:payload.fileUrl||null,fileName:payload.fileName||null,ts:Date.now()
    };
    const preview=message.type==="file"?`[파일] ${message.fileName||"파일"}`:message.type==="image"?"[사진]":message.text;
    if(mode==="firebase"){
      const ref=db.ref(`${MiniTalkConfig.paths.messages}/${roomId}`).push();await ref.set(message);
      await db.ref(`${MiniTalkConfig.paths.rooms}/${roomId}`).update({lastMessage:preview,updatedAt:firebase.database.ServerValue.TIMESTAMP});
      const saved={id:ref.key,...message};MiniTalk.Chat.ServerBackup?.message(saved);return saved;
    }
    const value={id:crypto.randomUUID(),...message},list=localGet(`messages.${roomId}`,[]);list.push(value);localSet(`messages.${roomId}`,list.slice(-200));
    const rooms=localGet("rooms",{});rooms[roomId]={...(rooms[roomId]||{id:roomId,title:roomId}),lastMessage:preview,updatedAt:Date.now()};localSet("rooms",rooms);broadcast("message",value);broadcast("rooms",rooms);return value;
  }
  async function getRoom(roomId){
    if(mode==="firebase"){const snap=await db.ref(`${MiniTalkConfig.paths.rooms}/${roomId}`).once("value");return snap.val()||null}
    return localGet("rooms",{})[roomId]||null
  }
  async function saveRoom(room){
    if(mode==="firebase"){await db.ref(`${MiniTalkConfig.paths.rooms}/${room.id}`).set(room);MiniTalk.Chat.ServerBackup?.room("UPSERT",room)}
    else{const rooms=localGet("rooms",{});rooms[room.id]=room;localSet("rooms",rooms);broadcast("rooms",rooms)}
    return room
  }
  async function createRoom(title,password=""){
    const clean=String(title||"").trim().slice(0,40);if(!clean)throw new Error("대화방 이름을 입력하세요.");
    const secret=String(password||"").trim();if(secret&&secret.length<4)throw new Error("비밀번호는 4자 이상 입력하세요.");if(secret.length>32)throw new Error("비밀번호는 32자 이하로 입력하세요.");
    const id=`room-${crypto.randomUUID().slice(0,8)}`,now=Date.now();
    const room={id,title:clean,type:"group",creator:user.user_id,createdAt:now,updatedAt:now,lastMessage:"",members:{[user.user_id]:memberValue("owner")},hasPassword:Boolean(secret)};
    if(secret){room.passwordSalt=passwordSalt();room.passwordHash=await passwordHash(secret,room.passwordSalt)}
    return saveRoom(room);
  }
  async function joinRoom(roomId,password=""){
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.id==="global"||isRoomMember(room))return room;
    if(room.hasPassword){const attempt=await passwordHash(String(password||""),room.passwordSalt||"");if(attempt!==room.passwordHash)throw new Error("대화방 비밀번호가 올바르지 않습니다.")}
    const members={...roomMembers(room)};if(room.creator&&!members[room.creator])members[room.creator]={user_id:room.creator,nickname:room.creator,role:"owner",joinedAt:room.createdAt||Date.now()};
    room.members={...members,[user.user_id]:memberValue(room.creator===user.user_id?"owner":"member")};room.updatedAt=Date.now();return saveRoom(room)
  }
  async function updateRoomPassword(roomId,password=""){
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.id==="global")throw new Error("전체 대화에는 비밀번호를 설정할 수 없습니다.");if(room.creator!==user.user_id)throw new Error("방장만 비밀번호를 변경할 수 있습니다.");
    const secret=String(password||"").trim();if(secret&&secret.length<4)throw new Error("비밀번호는 4자 이상 입력하세요.");if(secret.length>32)throw new Error("비밀번호는 32자 이하로 입력하세요.");
    room.hasPassword=Boolean(secret);if(secret){room.passwordSalt=passwordSalt();room.passwordHash=await passwordHash(secret,room.passwordSalt)}else{delete room.passwordSalt;delete room.passwordHash}room.updatedAt=Date.now();return saveRoom(room)
  }
  async function removeRoomMember(roomId,memberId){
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.creator!==user.user_id)throw new Error("방장만 멤버를 내보낼 수 있습니다.");if(memberId===user.user_id)throw new Error("방장은 방 나가기를 이용하세요.");
    const members={...roomMembers(room)};if(!members[memberId])return room;delete members[memberId];room.members=members;room.updatedAt=Date.now();return saveRoom(room)
  }
  async function leaveRoom(roomId){
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.id==="global")throw new Error("전체 대화에서는 나갈 수 없습니다.");
    const members={...roomMembers(room)};delete members[user.user_id];const remaining=Object.values(members).filter(Boolean);let deleted=false,newCreator=null;
    if(room.creator===user.user_id){if(remaining.length){remaining.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));newCreator=remaining[0].user_id;members[newCreator]={...members[newCreator],role:"owner"};room.creator=newCreator}else deleted=true}
    if(deleted){if(mode==="firebase"){await db.ref().update({[`${MiniTalkConfig.paths.rooms}/${roomId}`]:null,[`${MiniTalkConfig.paths.messages}/${roomId}`]:null});MiniTalk.Chat.ServerBackup?.room("DELETE",room)}else{const rooms=localGet("rooms",{});delete rooms[roomId];localSet("rooms",rooms);localRemove(`messages.${roomId}`);broadcast("rooms",rooms)}}
    else{room.members=members;room.updatedAt=Date.now();await saveRoom(room)}
    return{deleted,newCreator}
  }

  async function saveProfile(profile){
    if(!user?.user_id||user.isGuest)throw new Error("프로필 수정은 로그인 후 이용할 수 있습니다.");
    const statusMsg=String(profile?.statusMsg||"").trim().slice(0,100);
    const avatar=String(profile?.avatar||"");
    if(avatar&&(!avatar.startsWith("data:image/")||avatar.length>450000))throw new Error("프로필 이미지가 너무 크거나 올바르지 않습니다.");
    const value={user_id:user.user_id,nickname:user.nickname,statusMsg,avatar,updatedAt:Date.now()};
    if(mode==="firebase")await db.ref(`${MiniTalkConfig.paths.profiles}/${user.user_id}`).set({...value,updatedAt:firebase.database.ServerValue.TIMESTAMP});
    else{const profiles=localGet("profiles",{});profiles[user.user_id]=value;localSet("profiles",profiles);broadcast("profiles",profiles)}
    return value;
  }
  async function sendCommand(target,type,payload){MiniTalk.AdminSession.requireToken();const command={type,payload,createdAt:Date.now(),issuedBy:user.user_id,status:"pending"};if(mode==="firebase")await db.ref(`${MiniTalkConfig.paths.commands}/${target}`).push(command);else{const value={id:crypto.randomUUID(),...command};broadcast("command",{target,command:value})}}
  async function assignTask(target,task){MiniTalk.AdminSession.requireToken();const id=crypto.randomUUID(),value={...task,id,status:"open",createdAt:Date.now(),issuedBy:user.user_id};if(mode==="firebase")await db.ref(`${MiniTalkConfig.paths.tasks}/${target}/${id}`).set(value);else{const all=localGet(`tasks.${target}`,{});all[id]=value;localSet(`tasks.${target}`,all);broadcast("task",{target})}return id}
  async function submitTask(id,answer){if(mode==="firebase")await db.ref(`${MiniTalkConfig.paths.tasks}/${user.user_id}/${id}`).update({answer,status:"submitted",submittedAt:firebase.database.ServerValue.TIMESTAMP});else{const all=localGet(`tasks.${user.user_id}`,{});all[id]={...all[id],answer,status:"submitted",submittedAt:Date.now()};localSet(`tasks.${user.user_id}`,all);broadcast("task",{target:user.user_id})}}
  async function addShopInventory(ownerId,item){
    const id=String(item.id||crypto.randomUUID()),value={...item,id,ownerId,createdAt:Number(item.createdAt)||Date.now()};
    if(mode==="firebase")await db.ref(`${MiniTalkConfig.paths.shopInventory}/${ownerId}/${id}`).set(value);
    else{const inventory=localGet(`shop.inventory.${ownerId}`,{});inventory[id]=value;localSet(`shop.inventory.${ownerId}`,inventory);broadcast("shop-inventory",{target:ownerId})}
    return value;
  }
  async function useShopInventory(id){
    if(user?.isGuest)throw new Error("로그인이 필요합니다.");
    const usedAt=Date.now();
    if(mode==="firebase")await db.ref(`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${id}`).update({usedAt});
    else{const inventory=localGet(`shop.inventory.${user.user_id}`,{});if(!inventory[id])throw new Error("보관함 상품을 찾을 수 없습니다.");inventory[id]={...inventory[id],usedAt};localSet(`shop.inventory.${user.user_id}`,inventory);broadcast("shop-inventory",{target:user.user_id})}
    return usedAt;
  }
  async function giftShopInventory(id,targetId,targetNickname){
    if(user?.isGuest)throw new Error("로그인이 필요합니다.");
    if(!targetId||targetId===user.user_id)throw new Error("선물할 사용자를 선택하세요.");
    if(mode==="firebase"){
      const sourceRef=db.ref(`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${id}`),snap=await sourceRef.once("value"),item=snap.val();
      if(!item||item.usedAt)throw new Error("선물할 수 없는 상품입니다.");
      const giftId=crypto.randomUUID(),updates={};
      updates[`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${id}`]=null;
      updates[`${MiniTalkConfig.paths.shopInventory}/${targetId}/${giftId}`]={...item,id:giftId,ownerId:targetId,giftedBy:user.user_id,giftedByNickname:user.nickname,giftedAt:firebase.database.ServerValue.TIMESTAMP};
      await db.ref().update(updates);
    }else{
      const source=localGet(`shop.inventory.${user.user_id}`,{}),item=source[id];if(!item||item.usedAt)throw new Error("선물할 수 없는 상품입니다.");delete source[id];localSet(`shop.inventory.${user.user_id}`,source);
      const target=localGet(`shop.inventory.${targetId}`,{}),giftId=crypto.randomUUID();target[giftId]={...item,id:giftId,ownerId:targetId,giftedBy:user.user_id,giftedByNickname:user.nickname,giftedAt:Date.now()};localSet(`shop.inventory.${targetId}`,target);
      broadcast("shop-inventory",{target:user.user_id});broadcast("shop-inventory",{target:targetId});
    }
    return{targetId,targetNickname};
  }
  return{init,cleanup,getMode:()=>mode,subscribeMessages,unsubscribeMessages,sendMessage,createRoom,getRoom,joinRoom,isRoomMember,updateRoomPassword,removeRoomMember,leaveRoom,saveProfile,sendCommand,assignTask,submitTask,addShopInventory,useShopInventory,giftShopInventory};
})();
