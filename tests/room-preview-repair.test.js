const fs=require('fs'),vm=require('vm'),assert=require('assert');
const rt=fs.readFileSync(__dirname+'/../js/adapters/realtime.js','utf8');
const chunk=rt.slice(rt.indexOf('  function previewFromMessage'),rt.indexOf('  async function migrateAllRoomSummaries'));
let reads=0,rows=[{type:'text',text:'오래된 마지막 대화',ts:100,user_id:'last',nickname:'마지막'},{type:'game',ts:110,game:{kind:'game-state'}}];
const q={orderByChild(){return this},limitToLast(n){assert.equal(n,10);return this},async once(){reads++;return {forEach(fn){rows.forEach((m,i)=>fn({key:String(i),val:()=>m}))}}}};
const ctx={db:{ref:()=>q},messagesPath:id=>id,roomSummaryValue:r=>r};vm.createContext(ctx);vm.runInContext(chunk+';globalThis.repair=lastMessageSummary;',ctx);
(async()=>{
 const fixed=await ctx.repair('r',{lastMessage:'',lastMessageAt:100});assert.equal(fixed.lastMessage,'오래된 마지막 대화');assert.equal(fixed.lastMessageUserId,'last');assert.equal(fixed.lastMessageAt,100);
 const count=reads;await ctx.repair('r',{lastMessage:'기존 정상 요약',lastMessageUserId:'last',lastMessageAt:100});assert.equal(reads,count);
 rows=[];const empty=await ctx.repair('r',{lastMessage:'',lastMessageAt:0});assert.equal(empty.lastMessageAt,0);
 const chats=fs.readFileSync(__dirname+'/../js/features/chats.js','utf8');const profiles={last:{avatar:'last.png'},other:{avatar:'other.png'}};
 const roomCtx={MiniTalk:{Store:{get:k=>k==='profiles'?profiles:{user_id:'me'}}},canShowRoomPreview:r=>!r.locked};vm.createContext(roomCtx);
 vm.runInContext(chats.slice(chats.indexOf('  function profileForMessage'),chats.indexOf('  function favoriteKey'))+';globalThis.avatar=roomAvatar;',roomCtx);
 assert.equal(roomCtx.avatar({lastMessageUserId:'last',otherUserId:'other',avatar:'room.png'}),'last.png');assert.equal(roomCtx.avatar({locked:true,lastMessageUserId:'last',avatar:'room.png'}),'room.png');
 console.log('ROOM_PREVIEW_REPAIR_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
