/* ============================================================
   실시간 통신 어댑터
   - 외부 Firebase SDK는 실제 키가 있을 때만 지연 로드합니다.
   - 기능 모듈은 Firebase/localStorage를 직접 호출하지 않습니다.
   - 재로그인·재진입 시 기존 구독과 타이머를 반드시 정리합니다.
   ============================================================ */
MiniTalk.Realtime=(()=>{
  let mode="idle",db=null,user=null,channel=null,heartbeat=null,storageHandler=null,presenceRef=null,connectionError="",firebaseAuthenticated=false;
  let currentProfiles={},legacyProfiles={};
  let messageUnsub=null,shopInventoryUnsub=null,shopInventoryFallback=false,serverCommandTimer=0,serverCommandPolling=false,serverCommandRepoll=false;
  const unsubs=[];
  const handledCommands=new Set();
  const pendingAdminDispatches=new Map();
  const localPrefix="miniTalk.v3.data.";

  const validKey=()=>{const k=MiniTalkConfig.firebase.apiKey;return Boolean(k&&!k.includes("__FIREBASE")&&k.length>20)};
  const emit=(type,data)=>MiniTalk.Events.emit(`rt:${type}`,data);
  const localGet=(key,fallback={})=>{try{const raw=localStorage.getItem(localPrefix+key);if(raw===null)return fallback;const parsed=JSON.parse(raw);if(Array.isArray(fallback))return Array.isArray(parsed)?parsed:fallback;if(fallback&&typeof fallback==="object"&&!Array.isArray(fallback))return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:fallback;return parsed??fallback}catch{return fallback}};
  const localSet=(key,value)=>{try{localStorage.setItem(localPrefix+key,JSON.stringify(value))}catch(error){if(error?.name==="QuotaExceededError")throw new Error("이 기기의 로컬 저장 공간이 부족합니다.");throw error}};
  const localRemove=key=>{try{localStorage.removeItem(localPrefix+key)}catch{}};
  const memberValue=(role="member")=>({user_id:user.user_id,nickname:user.nickname,role,joinedAt:Date.now()});
  const roomMembers=room=>room?.members&&typeof room.members==="object"&&!Array.isArray(room.members)?room.members:{};
  const isRoomMember=room=>room?.id==="global"||Boolean(roomMembers(room)[user?.user_id]);
  const requireWritableUser=()=>{if(!user?.user_id||user.isGuest)throw new Error("게스트는 내용을 볼 수만 있습니다.");return user};
  const messagesPath=roomId=>roomId==="global"?MiniTalkConfig.paths.globalMessages:`${MiniTalkConfig.paths.roomMessages}/${roomId}`;
  const commandSignalRoom=userId=>`admin-${String(userId||"").replace(/[^0-9A-Za-z_-]/g,"_").slice(0,100)}`;
  function normalizeRoom(id,value={}){
    const participants=Array.isArray(value.participants)?value.participants:(Array.isArray(value.members)?value.members:[]);
    const members={};
    Object.entries(roomMembers(value)).forEach(([key,entry])=>{
      const member=entry&&typeof entry==="object"?entry:{nickname:String(entry||key)};
      const nickname=String(member.nickname||key);
      const memberId=nickname===user?.nickname?user.user_id:String(member.user_id||key);
      members[memberId]={...member,user_id:memberId,nickname}
    });
    participants.forEach((entry,index)=>{
      const nickname=String(typeof entry==="string"?entry:(entry?.nickname||"")).trim();if(!nickname)return;
      const memberId=String(entry?.user_id||(nickname===user?.nickname?user.user_id:`legacy-${index}-${nickname.replace(/[.#$\[\]/]/g,"-")}`));
      members[memberId]={user_id:memberId,nickname,role:index===0?"owner":"member",joinedAt:Number(entry?.joinedAt||0)}
    });
    const creatorRaw=String(value.creator||"");
    const creator=creatorRaw===user?.nickname?user.user_id:creatorRaw;
    const lastMessageAt=Number(value.lastMessageAt||value.last_message_at||(value.lastMessage?value.updatedAt:0)||0);
    return{...value,id:String(value.id||id),title:String(value.title||value.name||(id==="global"?"전체 대화":"대화방")),creator,members,hasPassword:Boolean(value.hasPassword||value.password),lastMessageAt}
  }
  const firebaseRoomValue=room=>({...room,name:String(room?.title||room?.name||"대화방")});
  async function passwordHash(password,salt){
    if(!crypto?.subtle||typeof TextEncoder==="undefined")throw new Error("이 브라우저에서는 대화방 비밀번호를 사용할 수 없습니다.");
    const bytes=new TextEncoder().encode(`${salt}:${password}`),digest=await crypto.subtle.digest("SHA-256",bytes);
    return[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("")
  }
  function passwordSalt(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return[...bytes].map(v=>v.toString(16).padStart(2,"0")).join("")}

  function addScript(src){return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.src===src);if(existing){if(window.firebase)return resolve();existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true});return}const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error(`SDK 로드 실패: ${src}`));document.head.append(script)})}
  async function loadFirebase(){
    if(!window.firebase?.app)await addScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
    if(!window.firebase?.database)await addScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js")
  }
  function waitForConnected(database,timeout=7000){return new Promise((resolve,reject)=>{const ref=database.ref(".info/connected");const timer=setTimeout(()=>{ref.off("value",onValue);reject(new Error("Firebase 연결 시간 초과"))},timeout);function onValue(s){if(s.val()===true){clearTimeout(timer);ref.off("value",onValue);resolve()}}ref.on("value",onValue)})}

  function bind(ref,event,fn,errorMessage="실시간 데이터를 읽지 못했습니다."){
    const fail=error=>{console.error(errorMessage,error);emit("error",{message:errorMessage,code:String(error?.code||"")})};
    ref.on(event,fn,fail);const off=()=>ref.off(event,fn);unsubs.push(off);return off
  }
  function bindFirstValue(ref,fn,errorMessage="실시간 데이터를 읽지 못했습니다."){
    return new Promise(resolve=>{let pending=true;const finish=()=>{if(!pending)return;pending=false;resolve()};const success=snapshot=>{try{fn(snapshot)}finally{finish()}};const fail=error=>{console.error(errorMessage,error);emit("error",{message:errorMessage,code:String(error?.code||"")});finish()};ref.on("value",success,fail);unsubs.push(()=>ref.off("value",success))})
  }
  function normalizeProfiles(source={}){
    const result={};
    Object.entries(source||{}).forEach(([key,raw])=>{
      const rawAvatar=typeof raw==="string"?raw:"",value=raw&&typeof raw==="object"?raw:{};
      const userId=String(value.user_id||value.userId||value.uid||key);
      const nickname=String(value.nickname||value.name||value.username||key);
      const avatar=String(value.avatar||value.profileImage||value.profile_image||value.profileImageUrl||value.profile_image_url||value.avatarUrl||value.photoURL||value.photoUrl||value.imageUrl||value.image_url||value.picture||value.image||rawAvatar||"");
      const statusMsg=String(value.statusMsg||value.statusMessage||value.status_message||value.status||"");
      const profile={...value,user_id:userId,nickname,avatar,statusMsg};
      result[key]=profile;result[userId]=profile;if(nickname)result[nickname]=profile;
    });
    return result
  }
  function publishProfiles(){emit("profiles",{...normalizeProfiles(legacyProfiles),...normalizeProfiles(currentProfiles)})}
  function cleanup(){
    const previousUser=user;
    messageUnsub?.();messageUnsub=null;
    shopInventoryUnsub?.();shopInventoryUnsub=null;shopInventoryFallback=false;
    while(unsubs.length){try{unsubs.pop()()}catch{}}
    if(heartbeat){clearInterval(heartbeat);heartbeat=null}
    if(serverCommandTimer){clearInterval(serverCommandTimer);serverCommandTimer=0}serverCommandPolling=false;serverCommandRepoll=false;
    if(storageHandler){removeEventListener("storage",storageHandler);storageHandler=null}
    if(channel){channel.close();channel=null}
    if(mode==="firebase"&&presenceRef){presenceRef.update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{});presenceRef=null}
    if(mode==="local"&&previousUser?.user_id){try{const all=localGet("presence",{});if(all[previousUser.user_id]){all[previousUser.user_id].online=false;all[previousUser.user_id].lastSeen=Date.now();localSet("presence",all)}}catch{}}
    handledCommands.clear();pendingAdminDispatches.clear();
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
    cleanup();user=nextUser;db=null;mode="local";connectionError="";firebaseAuthenticated=false;shopInventoryFallback=false;currentProfiles={};legacyProfiles={};
    // 사용자 인증의 기준은 Apps Script/시트 로그인입니다. 게스트는 Firebase에 연결하지 않습니다.
    if(validKey()&&!nextUser?.isGuest){
      try{await loadFirebase();if(!firebase.apps.length)firebase.initializeApp(MiniTalkConfig.firebase);db=firebase.database();await waitForConnected(db);mode="firebase"}
      catch(error){connectionError=String(error?.code||error?.message||error);console.warn("Firebase 연결 실패, 로컬 모드로 전환",error);db=null;mode="local"}
    }
    MiniTalk.Store.set("transport",mode);
    if(mode==="firebase")await startFirebase();else await startLocal();
    if(!nextUser?.isGuest)startServerCommandPolling();
    return mode;
  }

  async function startFirebase(){
    const initialData=[];
    initialData.push(bindFirstValue(db.ref(MiniTalkConfig.paths.rooms),s=>{const source=s.val()||{},rooms={};Object.entries(source).forEach(([id,value])=>{rooms[id]=normalizeRoom(id,value||{})});emit("rooms",rooms)},"대화방 목록을 읽을 권한이 없습니다."));
    // 사용자 신원 확인은 Apps Script 로그인에서 끝냅니다. Firebase 익명 인증은 사용하지 않습니다.
    // Firebase는 로그인 성공 후 실시간 데이터 저장/동기화 통로로만 사용합니다.
    initialData.push(bindFirstValue(db.ref(MiniTalkConfig.paths.legacyProfiles),s=>{legacyProfiles=s.val()||{};publishProfiles()},"기존 프로필 목록을 읽을 권한이 없습니다."));
    presenceRef=db.ref(`${MiniTalkConfig.paths.presence}/${user.user_id}`);
    await presenceRef.set({user_id:user.user_id,nickname:user.nickname,online:true,lastSeen:firebase.database.ServerValue.TIMESTAMP});
    presenceRef.onDisconnect().update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP});
    bind(db.ref(MiniTalkConfig.paths.presence),"value",s=>emit("presence",s.val()||{}));
    initialData.push(bindFirstValue(db.ref(MiniTalkConfig.paths.profiles),s=>{currentProfiles=s.val()||{};publishProfiles()}));
    // 쇼핑 보관함은 기존 서버(Apps Script) 흐름을 유지하므로 Firebase 공개 경로로 전환하지 않습니다.
    shopInventoryFallback=true;
    emit("shop-inventory",localGet(`shop.inventory.${user.user_id}`,{}));
    emit("tasks",{});
    /* 명령 내용은 서버에서 검증·보관하고, Firebase 신호는 수신자가 즉시 서버 큐를 확인하게만 합니다. */
    bind(db.ref(`signals/${commandSignalRoom(user.user_id)}/wakeup`),"value",snapshot=>{if(snapshot.exists())pollServerCommands()},"관리자 알림 신호를 읽지 못했습니다.");
    // 첫 대화 화면보다 사용자 프로필·대화방 목록이 먼저 준비되어 기본 이미지가 잠깐 보이는 현상을 막습니다.
    await Promise.all(initialData);await ensureDefaultRoom();
  }

  async function startLocal(){
    if("BroadcastChannel" in window){channel=new BroadcastChannel("mini-talk-v3");channel.onmessage=e=>handleLocal(e.data)}
    else{storageHandler=e=>{if(e.key===localPrefix+"pulse"&&e.newValue){try{handleLocal(JSON.parse(e.newValue))}catch{}}};addEventListener("storage",storageHandler)}
    await ensureDefaultRoom();updatePresence();heartbeat=setInterval(updatePresence,15000);
    emit("rooms",localGet("rooms",{}));emit("profiles",localGet("profiles",{}));emit("tasks",localGet(`tasks.${user.user_id}`,{}));emit("shop-inventory",localGet(`shop.inventory.${user.user_id}`,{}));
  }

  async function pollServerCommands(){
    if(!user?.user_id||user.isGuest||!MiniTalk.AuthApi?.userCommands)return;
    if(serverCommandPolling){serverCommandRepoll=true;return}
    serverCommandPolling=true;
    try{
      const commands=await MiniTalk.AuthApi.userCommands(user.user_id),ack=[];
      for(const command of commands){
        if(!command?.id||handledCommands.has(command.id)){if(command?.id)ack.push(command.id);continue}
        handledCommands.add(command.id);ack.push(command.id);
        if(command.type==="TASK"){
          const task={...(command.payload?.task||command.payload||{}),id:command.id,status:"open",createdAt:command.createdAt||Date.now(),issuedBy:command.issuedBy||"admin"};
          const current={...(MiniTalk.Store.get("tasks")||{}),[task.id]:task};localSet(`server.tasks.${user.user_id}`,current);emit("tasks",current);
        }else emit("command",command);
      }
      if(ack.length)await MiniTalk.AuthApi.userCommands(user.user_id,ack);
    }catch(error){console.warn("서버 명령 확인 실패",error)}finally{serverCommandPolling=false;if(serverCommandRepoll){serverCommandRepoll=false;queueMicrotask(pollServerCommands)}}
  }
  function startServerCommandPolling(){
    const saved=localGet(`server.tasks.${user.user_id}`,{});if(Object.keys(saved).length)emit("tasks",{...(MiniTalk.Store.get("tasks")||{}),...saved});
    pollServerCommands();if(!serverCommandTimer)serverCommandTimer=setInterval(pollServerCommands,10000);
  }

  async function ensureDefaultRoom(){
    const room={id:"global",name:"전체 대화",title:"전체 대화",type:"group",updatedAt:Date.now(),lastMessage:""};
    if(mode==="firebase"){const ref=db.ref(`${MiniTalkConfig.paths.rooms}/global`);const snap=await ref.once("value");if(!snap.exists()){await ref.set(room);MiniTalk.Chat.ServerBackup?.room("CREATE",room)}}
    else{const rooms=localGet("rooms",{});if(!rooms.global){rooms.global=room;localSet("rooms",rooms)}}
  }
  function updatePresence(){const all=localGet("presence",{}),now=Date.now();for(const id of Object.keys(all))all[id].online=Boolean(all[id].online&&now-(all[id].lastSeen||0)<45000);all[user.user_id]={user_id:user.user_id,nickname:user.nickname,online:true,lastSeen:now};localSet("presence",all);broadcast("presence",all)}

  function unsubscribeMessages(){messageUnsub?.();messageUnsub=null}
  async function subscribeMessages(roomId){
    unsubscribeMessages();emit("message-reset",roomId);
    if(mode==="firebase"){
      const ref=db.ref(messagesPath(roomId)).orderByChild("ts").limitToLast(100);
      const fn=s=>{const value=s.val()||{};emit("message",{...value,id:s.key,roomId:value.roomId||roomId})};
      const fail=error=>{console.error("대화내역 구독 실패",error);emit("error",{message:"대화내역을 읽을 권한이 없습니다.",code:String(error?.code||"")})};
      ref.on("child_added",fn,fail);messageUnsub=()=>ref.off("child_added",fn);
    }else localGet(`messages.${roomId}`,[]).slice(-100).forEach(message=>emit("message",message));
  }
  async function pruneRoomMessages(roomId,keep=100){
    if(mode!=="firebase"||!db)return;
    try{
      /* 기존 서버에 100개보다 훨씬 많이 쌓여 있어도 한 번의 정리 호출로 끝까지 줄입니다.
       * 매번 최신 keep+50개만 읽고 가장 오래된 초과분을 지운 뒤, 100개 이하가 될 때까지 반복합니다. */
      for(let pass=0;pass<40;pass+=1){
        const snap=await db.ref(messagesPath(roomId)).orderByChild("ts").limitToLast(keep+50).once("value"),rows=[];
        snap.forEach(child=>rows.push({key:child.key,ts:Number(child.child("ts").val())||0}));
        if(rows.length<=keep)return;
        rows.sort((a,b)=>a.ts-b.ts||String(a.key).localeCompare(String(b.key)));
        const updates={};rows.slice(0,rows.length-keep).forEach(row=>updates[row.key]=null);
        if(!Object.keys(updates).length)return;
        await db.ref(messagesPath(roomId)).update(updates);
      }
      console.warn("오래된 대화 정리가 40회 제한에 도달했습니다.",roomId);
    }catch(error){console.warn("오래된 대화 정리 실패",error)}
  }

  async function sendMessage(roomId,payload){
    requireWritableUser();
    payload=payload||{};
    const senderProfile=MiniTalk.Store.get("profiles")?.[user.user_id]||MiniTalk.Store.get("profiles")?.[user.nickname]||{};
    const message={
      roomId,user_id:user.user_id,nickname:user.nickname,
      type:payload.type||(payload.fileUrl?"file":(payload.image||payload.imageUrl?"image":"text")),
      text:payload.text||"",image:payload.image||null,imageUrl:payload.imageUrl||null,
      fileUrl:payload.fileUrl||null,fileName:payload.fileName||null,emoticon:payload.emoticon||null,avatar:senderProfile.avatar||null,clientTs:Date.now(),ts:Date.now()
    };
    const preview=message.type==="file"?`[파일] ${message.fileName||"파일"}`:message.type==="image"?"[사진]":message.text;
    if(mode==="firebase"){
      const ref=db.ref(messagesPath(roomId)).push(),serverMessage={...message,ts:firebase.database.ServerValue.TIMESTAMP};
      await ref.set(serverMessage);
      await db.ref(`${MiniTalkConfig.paths.rooms}/${roomId}`).update({lastMessage:preview,lastMessageAt:firebase.database.ServerValue.TIMESTAMP,lastMessageUserId:user.user_id,lastMessageNickname:user.nickname,updatedAt:firebase.database.ServerValue.TIMESTAMP});
      const snap=await ref.once("value"),saved={id:ref.key,...(snap.val()||message)};MiniTalk.Chat.ServerBackup?.message(saved);pruneRoomMessages(roomId).catch(()=>{});return saved;
    }
    const value={id:crypto.randomUUID(),...message},list=localGet(`messages.${roomId}`,[]);list.push(value);localSet(`messages.${roomId}`,list.slice(-200));
    const rooms=localGet("rooms",{});rooms[roomId]={...(rooms[roomId]||{id:roomId,title:roomId}),lastMessage:preview,lastMessageAt:Date.now(),lastMessageUserId:user.user_id,lastMessageNickname:user.nickname,updatedAt:Date.now()};localSet("rooms",rooms);broadcast("message",value);broadcast("rooms",rooms);return value;
  }
  async function getRoom(roomId){
    if(mode==="firebase"){const snap=await db.ref(`${MiniTalkConfig.paths.rooms}/${roomId}`).once("value");return snap.exists()?normalizeRoom(roomId,snap.val()||{}):null}
    return localGet("rooms",{})[roomId]||null
  }
  async function saveRoom(room){
    if(mode==="firebase"){await db.ref(`${MiniTalkConfig.paths.rooms}/${room.id}`).set(firebaseRoomValue(room));MiniTalk.Chat.ServerBackup?.room("UPSERT",room)}
    else{const rooms=localGet("rooms",{});rooms[room.id]=room;localSet("rooms",rooms);broadcast("rooms",rooms)}
    return room
  }
  async function createRoom(title,password=""){
    requireWritableUser();
    const clean=String(title||"").trim().slice(0,40);if(!clean)throw new Error("대화방 이름을 입력하세요.");
    const secret=String(password||"").trim();if(secret&&secret.length<4)throw new Error("비밀번호는 4자 이상 입력하세요.");if(secret.length>32)throw new Error("비밀번호는 32자 이하로 입력하세요.");
    const id=`room-${crypto.randomUUID().slice(0,8)}`,now=Date.now();
    const room={id,title:clean,type:"group",creator:user.user_id,createdAt:now,updatedAt:now,lastMessage:"",members:{[user.user_id]:memberValue("owner")},hasPassword:Boolean(secret)};
    if(secret){room.passwordSalt=passwordSalt();room.passwordHash=await passwordHash(secret,room.passwordSalt)}
    return saveRoom(room);
  }
  async function joinRoom(roomId,password=""){
    requireWritableUser();
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.id==="global"||isRoomMember(room))return room;
    if(room.hasPassword){const secret=String(password||"");if(room.password){if(secret!==String(room.password))throw new Error("대화방 비밀번호가 올바르지 않습니다.")}else{const attempt=await passwordHash(secret,room.passwordSalt||"");if(attempt!==room.passwordHash)throw new Error("대화방 비밀번호가 올바르지 않습니다.")}}
    const members={...roomMembers(room)};if(room.creator&&!members[room.creator])members[room.creator]={user_id:room.creator,nickname:room.creator,role:"owner",joinedAt:room.createdAt||Date.now()};
    room.members={...members,[user.user_id]:memberValue(room.creator===user.user_id?"owner":"member")};room.updatedAt=Date.now();return saveRoom(room)
  }
  async function updateRoomPassword(roomId,password=""){
    requireWritableUser();
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.id==="global")throw new Error("전체 대화에는 비밀번호를 설정할 수 없습니다.");if(room.creator!==user.user_id)throw new Error("방장만 비밀번호를 변경할 수 있습니다.");
    const secret=String(password||"").trim();if(secret&&secret.length<4)throw new Error("비밀번호는 4자 이상 입력하세요.");if(secret.length>32)throw new Error("비밀번호는 32자 이하로 입력하세요.");
    room.hasPassword=Boolean(secret);delete room.password;if(secret){room.passwordSalt=passwordSalt();room.passwordHash=await passwordHash(secret,room.passwordSalt)}else{delete room.passwordSalt;delete room.passwordHash}room.updatedAt=Date.now();return saveRoom(room)
  }
  async function removeRoomMember(roomId,memberId){
    requireWritableUser();
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.creator!==user.user_id)throw new Error("방장만 멤버를 내보낼 수 있습니다.");if(memberId===user.user_id)throw new Error("방장은 방 나가기를 이용하세요.");
    const members={...roomMembers(room)};if(!members[memberId])return room;delete members[memberId];room.members=members;room.updatedAt=Date.now();return saveRoom(room)
  }
  async function inviteRoomMembers(roomId,targets=[]){
    requireWritableUser();
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.id==="global")throw new Error("전체 대화에는 초대가 필요하지 않습니다.");
    if(!isRoomMember(room)&&!MiniTalk.AdminSession?.authorized?.())throw new Error("대화방 멤버만 초대할 수 있습니다.");
    const members={...roomMembers(room)};let added=0;
    targets.forEach(target=>{const userId=String(target?.user_id||"").trim(),nickname=String(target?.nickname||userId).trim();if(!userId||MiniTalk.UserDirectory?.isGuest?.(target)||target?.isGuest||/^guest-/i.test(userId)||members[userId]||userId===user.user_id)return;const now=Date.now();members[userId]={user_id:userId,nickname,role:"member",joinedAt:now,invitedAt:now,invitedBy:user.user_id};added++});
    if(!added)throw new Error("초대할 사용자를 선택하세요.");room.members=members;room.metadataUpdatedAt=Date.now();await saveRoom(room);return added
  }
  async function leaveRoom(roomId){
    requireWritableUser();
    const room=await getRoom(roomId);if(!room)throw new Error("대화방을 찾을 수 없습니다.");if(room.id==="global")throw new Error("전체 대화에서는 나갈 수 없습니다.");
    const members={...roomMembers(room)};delete members[user.user_id];const remaining=Object.values(members).filter(Boolean);let deleted=false,newCreator=null;
    if(room.creator===user.user_id){if(remaining.length){remaining.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));newCreator=remaining[0].user_id;members[newCreator]={...members[newCreator],role:"owner"};room.creator=newCreator}else deleted=true}
    if(deleted){if(mode==="firebase"){await db.ref().update({[`${MiniTalkConfig.paths.rooms}/${roomId}`]:null,[messagesPath(roomId)]:null});MiniTalk.Chat.ServerBackup?.room("DELETE",room)}else{const rooms=localGet("rooms",{});delete rooms[roomId];localSet("rooms",rooms);localRemove(`messages.${roomId}`);broadcast("rooms",rooms)}}
    else{room.members=members;room.updatedAt=Date.now();await saveRoom(room)}
    return{deleted,newCreator}
  }

  async function saveProfile(profile){
    if(!user?.user_id||user.isGuest)throw new Error("프로필 수정은 로그인 후 이용할 수 있습니다.");
    const statusMsg=String(profile?.statusMsg||"").trim().slice(0,100);
    const avatar=String(profile?.avatar||"");
    if(avatar&&(!avatar.startsWith("data:image/")||avatar.length>450000))throw new Error("프로필 이미지가 너무 크거나 올바르지 않습니다.");
    const value={user_id:user.user_id,nickname:user.nickname,statusMsg,avatar,updatedAt:Date.now()};
    if(mode==="firebase"){
      const saved={...value,updatedAt:firebase.database.ServerValue.TIMESTAMP};
      const legacyKey=String(user.nickname||user.user_id).replace(/[.#$\[\]\/]/g,"_").slice(0,30);
      /* Apps Script 로그인 성공 사용자를 기준으로 기존 호환 경로와 v3 프로필 경로를 함께 갱신합니다. */
      await db.ref(`${MiniTalkConfig.paths.legacyProfiles}/${legacyKey}`).set(saved);
      legacyProfiles={...legacyProfiles,[legacyKey]:saved};publishProfiles();
      try{await db.ref(`${MiniTalkConfig.paths.profiles}/${user.user_id}`).set(saved)}
      catch(error){console.warn("새 프로필 경로 동기화 실패",error)}
    }
    else{const profiles=localGet("profiles",{});profiles[user.user_id]=value;localSet("profiles",profiles);broadcast("profiles",profiles)}
    return value;
  }
  async function sendCommand(target,type,payload){return sendCommands([target],type,payload)}
  async function assignTask(target,task){const token=MiniTalk.AdminSession.requireToken();const id=crypto.randomUUID(),value={...task,id,status:"open",createdAt:Date.now(),issuedBy:user.user_id};if(MiniTalk.AuthApi?.adminDispatch){await MiniTalk.AuthApi.adminDispatch({userId:user.user_id,adminToken:token,targets:[target],type:"TASK",payload:{task:value}});notifyCommandTargets([target])}else{const all=localGet(`tasks.${target}`,{});all[id]=value;localSet(`tasks.${target}`,all);broadcast("task",{target})}return id}
  async function sendCommands(targets,type,payload){
    const token=MiniTalk.AdminSession.requireToken(),ids=[...new Set((targets||[]).map(String).map(v=>v.trim()).filter(Boolean))];if(!ids.length)throw new Error("대상 사용자를 선택하세요.");const createdAt=Date.now();
    if(MiniTalk.AuthApi?.adminDispatch){const signature=JSON.stringify([user.user_id,ids,type,payload||{}]),requestId=pendingAdminDispatches.get(signature)||crypto.randomUUID();pendingAdminDispatches.set(signature,requestId);const result=await MiniTalk.AuthApi.adminDispatch({userId:user.user_id,adminToken:token,targets:ids,type,payload,requestId});pendingAdminDispatches.delete(signature);notifyCommandTargets(ids);return Number(result.count)||ids.length}
    ids.forEach(target=>broadcast("command",{target,command:{id:crypto.randomUUID(),type,payload,createdAt,issuedBy:user.user_id,status:"pending"}}));return ids.length
  }
  function notifyCommandTargets(targets){const ids=[...new Set((targets||[]).map(String).map(value=>value.trim()).filter(Boolean))];if(mode!=="firebase"||!db||!ids.length)return Promise.resolve(false);const updates={};ids.forEach(target=>{updates[`signals/${commandSignalRoom(target)}/wakeup`]={ts:firebase.database.ServerValue.TIMESTAMP}});return Promise.race([db.ref().update(updates).then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),1800))]).catch(error=>{console.warn("관리자 즉시 알림 신호 전송 실패, 서버 폴링으로 대체",error);return false})}
  async function assignTasks(targets,task){
    const token=MiniTalk.AdminSession.requireToken(),ids=[...new Set((targets||[]).map(String).map(v=>v.trim()).filter(Boolean))];if(!ids.length)throw new Error("대상 사용자를 선택하세요.");const createdAt=Date.now();
    if(MiniTalk.AuthApi?.adminDispatch){const result=await MiniTalk.AuthApi.adminDispatch({userId:user.user_id,adminToken:token,targets:ids,type:"TASK",payload:{task:{...task,status:"open",createdAt,issuedBy:user.user_id}}});notifyCommandTargets(ids);return Number(result.count)||ids.length}
    ids.forEach(target=>{const id=crypto.randomUUID(),all=localGet(`tasks.${target}`,{});all[id]={...task,id,status:"open",createdAt,issuedBy:user.user_id};localSet(`tasks.${target}`,all);broadcast("task",{target})});return ids.length
  }
  async function submitTask(id,answer){requireWritableUser();const server=localGet(`server.tasks.${user.user_id}`,{});if(server[id]){server[id]={...server[id],answer,status:"submitted",submittedAt:Date.now()};localSet(`server.tasks.${user.user_id}`,server);emit("tasks",server);return}const all=localGet(`tasks.${user.user_id}`,{});all[id]={...all[id],answer,status:"submitted",submittedAt:Date.now()};localSet(`tasks.${user.user_id}`,all);broadcast("task",{target:user.user_id})}
  function localShopInventory(ownerId){const stored=localGet(`shop.inventory.${ownerId}`,{}),visible=ownerId===user?.user_id?(MiniTalk.Store.get("shopInventory")||{}):{};return{...visible,...stored}}
  function saveLocalShopInventory(ownerId,value){const inventory=localShopInventory(ownerId);inventory[value.id]={...value,pendingSync:true};localSet(`shop.inventory.${ownerId}`,inventory);emit("shop-inventory",inventory);return inventory[value.id]}
  function enableShopInventoryFallback(){if(shopInventoryFallback)return;shopInventoryFallback=true;shopInventoryUnsub?.();shopInventoryUnsub=null;const inventory=localShopInventory(user.user_id);localSet(`shop.inventory.${user.user_id}`,inventory);emit("shop-inventory",inventory)}
  async function syncPendingShopInventory(){if(mode!=="firebase"||!firebaseAuthenticated)return;const inventory=localGet(`shop.inventory.${user.user_id}`,{}),pending=Object.values(inventory).filter(item=>item?.id&&item.pendingSync);for(const item of pending){const value={...item};delete value.pendingSync;await db.ref(`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${item.id}`).set(value);delete inventory[item.id]}if(pending.length)localSet(`shop.inventory.${user.user_id}`,inventory)}
  async function addShopInventory(ownerId,item){
    requireWritableUser();
    const id=String(item.id||crypto.randomUUID()),value={...item,id,ownerId,createdAt:Number(item.createdAt)||Date.now()};
    if(mode==="firebase"&&firebaseAuthenticated&&!shopInventoryFallback){try{await db.ref(`${MiniTalkConfig.paths.shopInventory}/${ownerId}/${id}`).set(value);return value}catch(error){console.warn("보관함 서버 저장 실패, 동기화 대기열에 보존",error);enableShopInventoryFallback()}}
    saveLocalShopInventory(ownerId,value);
    return value;
  }
  async function useShopInventory(id, appliedAt=Date.now()){
    if(user?.isGuest)throw new Error("로그인이 필요합니다.");
    const usedAt=Number(appliedAt)||Date.now();
    if(mode==="firebase"&&firebaseAuthenticated&&!shopInventoryFallback){try{await db.ref(`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${id}`).update({usedAt});return usedAt}catch(error){console.warn("보관함 사용 처리 실패, 로컬로 전환",error);enableShopInventoryFallback()}}
    const inventory=localShopInventory(user.user_id);if(!inventory[id])throw new Error("보관함 상품을 찾을 수 없습니다.");inventory[id]={...inventory[id],usedAt,pendingSync:true};localSet(`shop.inventory.${user.user_id}`,inventory);emit("shop-inventory",inventory);
    return usedAt;
  }
  async function removeShopInventory(id){
    if(user?.isGuest)throw new Error("로그인이 필요합니다.");
    if(mode==="firebase"&&firebaseAuthenticated&&!shopInventoryFallback){try{await db.ref(`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${id}`).remove();return true}catch(error){console.warn("Firebase 보관함 항목 제거 실패",error);enableShopInventoryFallback()}}
    const inventory=localShopInventory(user.user_id);delete inventory[id];localSet(`shop.inventory.${user.user_id}`,inventory);emit("shop-inventory",inventory);return true
  }
  async function giftShopInventory(id,targetId,targetNickname){
    if(user?.isGuest)throw new Error("로그인이 필요합니다.");
    if(!targetId||targetId===user.user_id)throw new Error("선물할 사용자를 선택하세요.");
    if(mode==="firebase"&&firebaseAuthenticated&&!shopInventoryFallback){
      const sourceRef=db.ref(`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${id}`),snap=await sourceRef.once("value"),item=snap.val();
      if(!item||item.usedAt)throw new Error("선물할 수 없는 상품입니다.");
      const giftId=crypto.randomUUID(),updates={};
      updates[`${MiniTalkConfig.paths.shopInventory}/${user.user_id}/${id}`]=null;
      updates[`${MiniTalkConfig.paths.shopInventory}/${targetId}/${giftId}`]={...item,id:giftId,ownerId:targetId,giftedBy:user.user_id,giftedByNickname:user.nickname,giftedAt:firebase.database.ServerValue.TIMESTAMP};
      await db.ref().update(updates);
    }else throw new Error("실시간 서버 연결 후 선물할 수 있습니다.");
    return{targetId,targetNickname};
  }

  function safeCloudPath(path){const clean=String(path||"").replace(/^\/+|\/+$/g,"");if(!clean||clean.includes(".."))throw new Error("올바르지 않은 데이터 경로입니다.");return clean}
  async function cloudGet(path,fallback=null){const clean=safeCloudPath(path);if(mode==="firebase"&&db){const snap=await db.ref(clean).once("value");return snap.exists()?snap.val():fallback}return localGet(`cloud.${clean}`,fallback)}
  async function cloudSet(path,value){requireWritableUser();const clean=safeCloudPath(path);if(mode==="firebase"&&db){await db.ref(clean).set(value);return value}localSet(`cloud.${clean}`,value);return value}
  async function cloudUpdate(path,value){requireWritableUser();const clean=safeCloudPath(path);if(mode==="firebase"&&db){await db.ref(clean).update(value);return value}const current=localGet(`cloud.${clean}`,{});localSet(`cloud.${clean}`,{...current,...value});return value}
  async function cloudRemove(path){requireWritableUser();const clean=safeCloudPath(path);if(mode==="firebase"&&db){await db.ref(clean).remove();return true}localRemove(`cloud.${clean}`);return true}
  async function cloudPush(path,value){requireWritableUser();const clean=safeCloudPath(path),id=crypto.randomUUID();if(mode==="firebase"&&db){const ref=db.ref(clean).push(),payload={...value,createdAt:value?.createdAt??firebase.database.ServerValue.TIMESTAMP};await ref.set(payload);const snap=await ref.once("value");return{id:ref.key,...(snap.val()||value)}}const payload={id,...value,createdAt:Number(value?.createdAt)||Date.now()},current=localGet(`cloud.${clean}`,{});current[id]=payload;localSet(`cloud.${clean}`,current);return payload}
  async function cloudTransaction(path,updater){requireWritableUser();const clean=safeCloudPath(path);if(mode==="firebase"&&db){const result=await db.ref(clean).transaction(current=>updater(current));return result.snapshot?.val?.()}const current=localGet(`cloud.${clean}`,null),next=updater(current);if(next===undefined)return current;localSet(`cloud.${clean}`,next);return next}
  function cloudSubscribe(path,listener){const clean=safeCloudPath(path);if(mode==="firebase"&&db){const ref=db.ref(clean),fn=s=>listener(s.val());ref.on("value",fn);return()=>ref.off("value",fn)}listener(localGet(`cloud.${clean}`,null));return()=>{}}

  return{init,cleanup,getMode:()=>mode,isFirebaseAuthenticated:()=>firebaseAuthenticated,getConnectionError:()=>connectionError,subscribeMessages,unsubscribeMessages,sendMessage,createRoom,getRoom,joinRoom,isRoomMember,updateRoomPassword,removeRoomMember,inviteRoomMembers,leaveRoom,saveProfile,sendCommand,sendCommands,notifyCommandTargets,assignTask,assignTasks,submitTask,addShopInventory,useShopInventory,removeShopInventory,giftShopInventory,cloudGet,cloudSet,cloudUpdate,cloudRemove,cloudPush,cloudTransaction,cloudSubscribe};
})();
