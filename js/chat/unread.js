/* CHAT UNREAD - 방별 미확인 수 + 방 updatedAt 추적.
   Firebase에서는 현재 열린 방만 메시지 스트림을 구독하므로,
   방 목록의 updatedAt 변화도 함께 사용해 다른 방의 새 메시지를 감지합니다.
   읽음 상태는 계정별로 분리해 같은 기기에서 계정을 바꿔도 섞이지 않습니다. */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.Unread=(()=>{
  const BASE_KEY="chat.unread.v3",BASE_SEEN_KEY="chat.roomSeen.v2";
  const scope=()=>String(MiniTalk.Store.get("user")?.user_id||"anonymous").replace(/[^\w.-]/g,"_").slice(0,80);
  const key=()=>`${BASE_KEY}.${scope()}`,seenKey=()=>`${BASE_SEEN_KEY}.${scope()}`;
  const objectValue=(storageKey)=>{const value=MiniTalk.Persistence.get(storageKey,{});return value&&typeof value==="object"&&!Array.isArray(value)?value:{}};
  const get=()=>objectValue(key()),getSeen=()=>objectValue(seenKey());
  const save=v=>MiniTalk.Persistence.set(key(),v),saveSeen=v=>MiniTalk.Persistence.set(seenKey(),v);
  function emit(v){MiniTalk.Events.emit("chat:unread",v)}
  function clear(roomId,updatedAt){const v=get(),seen=getSeen();delete v[roomId];const ts=Number(updatedAt||MiniTalk.Store.get("rooms")?.[roomId]?.updatedAt||Date.now());if(Number.isFinite(ts)&&ts>0)seen[roomId]=Math.max(Number(seen[roomId]||0),ts);save(v);saveSeen(seen);emit(v)}
  function syncRooms(rooms,activeRoom){const v=get(),seen=getSeen();let countChanged=false,seenChanged=false;for(const room of Object.values(rooms||{})){if(!room?.id)continue;const ts=Number(room.updatedAt||0),prev=Number(seen[room.id]||0);if(!ts||ts<=prev)continue;seen[room.id]=ts;seenChanged=true;if(prev>0&&room.id!==activeRoom){v[room.id]=(v[room.id]||0)+1;countChanged=true}}if(seenChanged)saveSeen(seen);if(countChanged){save(v);emit(v)}return v}
  function count(roomId){return Number(get()[roomId]||0)}
  return{clear,count,all:get,syncRooms};
})();
