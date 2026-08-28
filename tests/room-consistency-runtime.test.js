const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto').webcrypto;
const root=path.resolve(__dirname,'..'),srcPath=path.join(root,'js/adapters/realtime.js');
let src=fs.readFileSync(srcPath,'utf8');
const needle='return{init,cleanup,startRoomListSubscription,stopRoomListSubscription,getMode:()=>mode';
if(!src.includes(needle))throw new Error('realtime return signature changed');
src=src.replace(needle,'return{_qa:{setState:x=>{if(\"db\" in x)db=x.db;if(\"user\" in x)user=x.user;if(\"mode\" in x)mode=x.mode;if(\"roomIndexReady\" in x)roomIndexReady=x.roomIndexReady},ensureCurrentUserRoomIndex,saveRoom,startRoomListSubscription,stopRoomListSubscription,attachMemberSummary,getCaches:()=>({roomsCache,roomDirectoryCache,roomListRequested,groupUnsubs:groupRoomUnsubs.length})},init,cleanup,startRoomListSubscription,stopRoomListSubscription,getMode:()=>mode');
const events=[];
const ctx={console,crypto,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,Promise,URL,fetch:async()=>{throw new Error('unexpected fetch')},localStorage:{getItem:()=>null,setItem(){},removeItem(){},key(){return null},get length(){return 0}},addEventListener(){},removeEventListener(){},BroadcastChannel:function(){},document:{scripts:[],createElement(){return{}},head:{append(){}}},window:{},MiniTalkConfig:{firebase:{apiKey:'x'.repeat(30),databaseURL:'https://example.test'},paths:{rooms:'rooms',roomMessages:'messages',globalMessages:'globalMessages',roomSummaries:'roomSummaries',userRooms:'userRooms',roomIndexUsers:'roomIndexUsers',roomSchema:'schema/roomSummaryVersion',presence:'presence',legacyProfiles:'legacyProfiles',profiles:'profiles'}},MiniTalk:{Events:{emit:(t,d)=>events.push([t,d])},Store:{set(){},get(){return null}},DataCache:{},Chat:{ServerBackup:{room(){}},Unread:{}},AdminSession:{authorized:()=>false},UserDirectory:{isGuest:()=>false}}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(src,ctx,{filename:'realtime.js'});const rt=ctx.MiniTalk.Realtime,qa=rt._qa;
function snap(value,key=''){return{key,exists:()=>value!==null&&value!==undefined,val:()=>value,forEach(fn){if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))fn(snap(v,k))}}}
const data={
  rooms:{
    'room-good':{id:'stale-inner-id',title:'Good',type:'group',creator:'u2',members:{u1:{user_id:'u1',nickname:'A',role:'member',joinedAt:1}},lastMessage:'hello',lastMessageAt:100},
    'room-legacy':{id:'room-legacy',title:'Legacy',type:'group',creator:'old-owner',participants:['A'],lastMessage:'old',lastMessageAt:50}
  },
  userRooms:{u1:{'room-legacy':{role:'member'},'room-gone':{role:'member'}}},roomIndexUsers:{u1:1},roomSummaries:{},messages:{}
};
const updates=[];let groupOn=0,groupOff=0,roomsReads=0;
function getPath(p){return p.split('/').filter(Boolean).reduce((o,k)=>o&&o[k],data)}
function applyUpdate(map){updates.push({...map});for(const [p,v] of Object.entries(map)){const parts=p.split('/').filter(Boolean);let o=data;for(let i=0;i<parts.length-1;i++)o=o[parts[i]]??=( {} );const k=parts.at(-1);if(v===null)delete o[k];else o[k]=v}}
function ref(path=''){
  const base=String(path||'');
  const obj={
    once:async()=>{if(base==='rooms')roomsReads++;return snap(getPath(base),base.split('/').at(-1)||'')},
    update:async map=>{if(base){const pref={};for(const [k,v] of Object.entries(map))pref[`${base}/${k}`]=v;applyUpdate(pref)}else applyUpdate(map)},
    set:async value=>applyUpdate({[base]:value}),remove:async()=>applyUpdate({[base]:null}),
    on:(ev)=>{if(base==='roomSummaries'&&['child_added','child_changed','child_removed'].includes(ev))groupOn++},
    off:(ev)=>{if(base==='roomSummaries'&&['child_added','child_changed','child_removed'].includes(ev))groupOff++},
    orderByChild(){return obj},startAt(){return obj},limitToLast(){return obj},endAt(){return obj},limitToFirst(){return obj},push(){return{key:'k1'}}
  };return obj
}
const db={ref};qa.setState({db,user:{user_id:'u1',nickname:'A',isGuest:false},mode:'firebase',roomIndexReady:Promise.resolve()});
(async()=>{
  await qa.ensureCurrentUserRoomIndex();
  if(!data.userRooms.u1['room-good'])throw new Error('missing real member room was not restored to userRooms');
  if(data.userRooms.u1['room-gone'])throw new Error('index for truly missing room was not removed');
  if(!data.userRooms.u1['room-legacy'])throw new Error('legacy existing room index was incorrectly deleted');
  if(data.rooms['room-good'].id!=='room-good')throw new Error('Firebase child key was not made canonical');
  if(data.roomIndexUsers.u1!==4)throw new Error('room index repair version not stored');
  await qa.ensureCurrentUserRoomIndex();if(roomsReads!==1)throw new Error('full rooms scan repeated after version gate');

  updates.length=0;
  await qa.saveRoom({id:'room-good',title:'Renamed',type:'group',creator:'u2',members:data.rooms['room-good'].members,hasPassword:false,updatedAt:200,lastMessage:'',lastMessageAt:0},{syncMemberships:false,newRoom:false});
  const flat=Object.assign({},...updates);
  for(const p of Object.keys(flat))if(/roomSummaries\/room-good\/(lastMessage|lastMessageAt|lastMessageUserId|lastMessageNickname|lastMessageEmoticon)$/.test(p)||/rooms\/room-good\/(lastMessage|lastMessageAt|lastMessageUserId|lastMessageNickname|lastMessageEmoticon)$/.test(p))throw new Error('metadata save overwrote last-message field: '+p);

  await qa.startRoomListSubscription();await qa.startRoomListSubscription();
  if(groupOn!==3)throw new Error('group listener was attached more than once: '+groupOn);
  qa.stopRoomListSubscription();if(groupOff!==3)throw new Error('group listener did not detach exactly once at feature leave');
  console.log('ROOM_CONSISTENCY_RUNTIME_OK');
})().catch(e=>{console.error(e);process.exit(1)});
