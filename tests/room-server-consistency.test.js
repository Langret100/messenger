const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const rt=fs.readFileSync(path.join(root,'js/adapters/realtime.js'),'utf8');
const chats=fs.readFileSync(path.join(root,'js/features/chats.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

// One-time cross-device userRooms consistency repair.
ok(rt.includes('const ROOM_INDEX_VERSION=4;'),'room index consistency version missing');
ok(rt.includes('if(Number(ready.val()||0)>=ROOM_INDEX_VERSION)return;'),'room index consistency repair is not version-gated');
ok(rt.includes('const [roomsSnap,indexSnap]=await Promise.all'),'one-time rooms/userRooms consistency comparison missing');
ok(rt.includes('if(!isRoomMember(room))continue;'),'missing server membership guard while rebuilding userRooms');
ok(rt.includes('updates[`${userRoomsPath(user.user_id)}/${id}`]=membershipValue(member);'),'missing userRooms repair for actual member room');
ok(rt.includes("if(id!==\"global\"&&!Object.prototype.hasOwnProperty.call(roomSource,id))updates[`${userRoomsPath(user.user_id)}/${id}`]=null"),'ghost userRooms entry is not removed only when room body is absent');
ok(rt.includes('updates[roomIndexUsersPath(user.user_id)]=ROOM_INDEX_VERSION;'),'room index consistency version is not persisted');
ok(rt.includes('if(String(raw.id||\"\")!==id)updates[`${MiniTalkConfig.paths.rooms}/${id}/id`]=id;'),'Firebase child key is not repaired as canonical room id');

// Preserve the lightweight room-list architecture: summaries only during normal list updates.
const memberSummary=rt.slice(rt.indexOf('function attachMemberSummary'),rt.indexOf('function startMemberRoomIndexSubscription'));
ok(memberSummary.includes('db.ref(`${roomSummariesPath()}/${id}`)'),'member room list does not subscribe to roomSummaries');
ok(memberSummary.includes('limitToLast(1)'),'damaged zero summary is not repaired with last-message-only probe');
ok(!memberSummary.includes('authoritativeRoom('),'member summary changes must not fetch full room detail');
const groupSub=rt.slice(rt.indexOf('async function startRoomListSubscription'),rt.indexOf('function startFirebase'));
ok(groupSub.includes('orderByChild("lastMessageAt").startAt(1)'),'group list must use lightweight lastMessageAt summary query');
ok(!groupSub.includes('getRoom(')&&!groupSub.includes('authoritativeRoom('),'group summary events must not fetch full room detail');
ok(groupSub.includes('if(roomListRequested&&groupRoomUnsubs.length)return;'),'group subscription is recreated on every filter switch');

// Metadata updates must never erase the current last-message summary.
const saveRoom=rt.slice(rt.indexOf('async function saveRoom'),rt.indexOf('async function createRoom'));
ok(saveRoom.includes('roomSummaryMetadata(room)'),'room metadata is not patched separately from last-message summary');
ok(saveRoom.includes('blocked=new Set(["lastMessage"'),'room metadata update can overwrite lastMessage fields');

// Room detail and password/member authority are evaluated when the room is actually opened.
ok(chats.includes('if(!room?._detail)room=await MiniTalk.Realtime.getRoom(roomId);'),'room detail is not loaded on demand when opening a summary');
ok(chats.includes('if(!MiniTalk.Realtime.isRoomMember(room)&&!isAdmin())'),'room entry does not verify actual membership');
ok(chats.includes('if(room.hasPassword){joinRoomDialog(room);return}'),'non-member password room no longer requests password');
ok(chats.includes('openRoom(room.id,joined)'),'successful password join cannot reopen with verified member detail');
ok(rt.includes('updates={[`${userRoomsPath(user.user_id)}/${roomId}`]:null}'),'leaving room does not remove membership index');

ok(index.includes('js/adapters/realtime.js?v=64.5.46')&&index.includes('js/features/chats.js?v=64.5.25'),'room consistency cache versions stale');
console.log('ROOM_SERVER_CONSISTENCY_OK');
