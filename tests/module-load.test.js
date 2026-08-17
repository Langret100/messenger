const fs=require('fs'),vm=require('vm'),cryptoNode=require('crypto');const path=require('path');const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(t,o={}){super(t);this.detail=o.detail}}
const storage=new Map();const style={setProperty(){},cssText:''};
const document={documentElement:{dataset:{},style},styleSheets:[],baseURI:'http://test/',scripts:[],head:{append(){}},body:{append(){},classList:{add(){},remove(){}}},getElementById(){return null},createElement(tag){return {tagName:tag.toUpperCase(),style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},setAttribute(){},addEventListener(){},append(){},appendChild(){},remove(){},querySelector(){return null},querySelectorAll(){return[]}}},querySelector(){return null},querySelectorAll(){return[]}};
const ev=new EventTarget();const ctx={console,EventTarget,Event,CustomEvent:CE,document,window:null,navigator:{},location:{reload(){}},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:f=>setTimeout(f,0),cancelAnimationFrame:clearTimeout,addEventListener:(t,f)=>ev.addEventListener(t,f),removeEventListener:(t,f)=>ev.removeEventListener(t,f),Audio:function(){this.play=()=>Promise.resolve()},Notification:{permission:'default'},Image:function(){},URL,URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true})})};ctx.window=ctx;vm.createContext(ctx);
const files=['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js','js/core/registry.js','js/core/router.js','js/adapters/persistence.js','js/adapters/auth-api.js','js/adapters/realtime.js','js/adapters/window-mode.js','js/adapters/mobile-immersive.js','js/economy/coin-wallet.js','js/economy/quest-reward.js','js/chat/emoji.js','js/chat/linkify.js','js/chat/attachments.js','js/chat/qr.js','js/chat/voice.js','js/chat/unread.js','js/chat/server-backup.js','js/ui/dom.js','js/ui/shell.js','js/ui/interaction-guard.js','js/games/score-service.js','js/games/ranking.js','js/games/board.js','js/game-bridge/game-host.js','js/tasks/quest-accordion.js','js/tasks/daily-quest-clock.js','js/tasks/daily-math-quest.js','js/tasks/daily-korean-quest.js','js/tasks/task-service.js','js/tasks/task-window.js','js/features/auth.js','js/features/chats.js','js/features/games.js','js/tarot.js','js/tools/notifications.js','js/tools/timer-alarm.js','js/tools/tarot-view.js','js/tools/profile-editor.js','js/tools/capture.js','js/features/tools.js','js/features/tasks.js','js/features/links.js','js/features/shopping.js','js/features/layout.js','js/features/settings.js','js/features/admin.js'];
for(const f of files){
  if(f==='js/adapters/realtime.js')vm.runInContext(fs.readFileSync(root+'/js/admin/session.js','utf8'),ctx,{filename:'js/admin/session.js'});
  if(f==='js/features/shopping.js')vm.runInContext(fs.readFileSync(root+'/js/shopping/store-service.js','utf8'),ctx,{filename:'js/shopping/store-service.js'});
  vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx,{filename:f});
}
const ids=ctx.MiniTalk.Registry.all().map(x=>x.id);
if(ids.join(',')!=='chats,games,tools,tasks,links,shopping,settings,admin')throw new Error('feature registry unexpected '+ids);
for(const name of ['Notifications','TimerAlarm','TarotView','ProfileEditor','Capture']){
  if(!ctx.MiniTalk.Tools[name])throw new Error(`missing tool module ${name}`);
}
for(const name of ['ScoreService','Ranking','Board']){
  if(!ctx.MiniTalk.Games[name])throw new Error(`missing game module ${name}`);
}
if(!ctx.MiniTalk.Tasks.DailyMathQuest)throw new Error('missing daily math quest module');
if(!ctx.MiniTalk.Tasks.DailyKoreanQuest)throw new Error('missing daily Korean quest module');
if(!ctx.MiniTalk.Economy.CoinWallet)throw new Error('missing coin wallet module');
if(!ctx.MiniTalk.Economy.QuestReward)throw new Error('missing quest reward module');
if(!ctx.MiniTalk.Shopping.StoreService)throw new Error('missing shopping store service module');
if(!ctx.MiniTalk.AdminSession)throw new Error('missing admin session module');
const propertyInput=ctx.MiniTalk.UI.Dom.el('input',{value:'확인',disabled:true});
if(propertyInput.value!=='확인'||propertyInput.disabled!==true)throw new Error('DOM property assignment failed');
console.log('MODULE_LOAD_OK',ids.join(','));
