const fs=require('fs'),vm=require('vm'),cryptoNode=require('crypto'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}}
class Storage{constructor(){this.map=new Map()}getItem(key){return this.map.has(key)?this.map.get(key):null}setItem(key,value){this.map.set(key,String(value))}removeItem(key){this.map.delete(key)}}
function context(){
  const events=new EventTarget(),ctx={console,EventTarget,Event,CustomEvent:CE,URLSearchParams,localStorage:new Storage(),crypto:{randomUUID:()=>cryptoNode.randomUUID()},setInterval,clearInterval,setTimeout,clearTimeout,addEventListener:(t,f)=>events.addEventListener(t,f),removeEventListener:(t,f)=>events.removeEventListener(t,f),window:null,document:{scripts:[],createElement(){throw new Error('DOM not expected')},head:{append(){}}}};
  ctx.window=ctx;vm.createContext(ctx);
  for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/realtime.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  return ctx;
}
async function rejects(action,label){let rejected=false;try{await action()}catch(error){rejected=/게스트/.test(String(error?.message||error))}if(!rejected)throw new Error(label)}
(async()=>{
  const ctx=context(),rt=ctx.MiniTalk.Realtime;
  await rt.init({user_id:'guest-test',nickname:'게스트',isGuest:true});
  await rejects(()=>rt.sendMessage('global',{text:'blocked'}),'guest chat write was not blocked');
  await rejects(()=>rt.createRoom('blocked room'),'guest room creation was not blocked');
  await rejects(()=>rt.joinRoom('global'),'guest room join mutation was not blocked');
  await rejects(()=>rt.submitTask('task-1','blocked'),'guest task submit was not blocked');
  await rejects(()=>rt.addShopInventory('guest-test',{id:'item-1'}),'guest shopping mutation was not blocked');
  rt.cleanup();
  const board=fs.readFileSync(path.join(root,'js/games/board.js'),'utf8');
  const chats=fs.readFileSync(path.join(root,'js/features/chats.js'),'utf8');
  const math=fs.readFileSync(path.join(root,'js/tasks/daily-math-quest.js'),'utf8');
  const korean=fs.readFileSync(path.join(root,'js/tasks/daily-korean-quest.js'),'utf8');
  const shop=fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8');
  if(!board.includes('user.isGuest) throw new Error("게스트는 게시글을 볼 수만 있습니다.")'))throw new Error('guest board write guard is missing');
  if(!chats.includes('guest-readonly-composer'))throw new Error('guest read-only composer UI is missing');
  if(!chats.includes('function roomHeaderActions(roomId){return MiniTalk.Store.get("user")?.isGuest?[]'))throw new Error('guest room management menu is still visible');
  if(!math.includes('done || guest')||!korean.includes('done || guest'))throw new Error('guest daily quest controls are not disabled');
  if(!shop.includes('!current.user_id||current.isGuest'))throw new Error('guest shopping service guard is missing');
  console.log('GUEST_READONLY_OK');
})().catch(error=>{console.error(error);process.exit(1)});
