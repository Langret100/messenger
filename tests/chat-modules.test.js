const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={console,window:null,MiniTalk:{Chat:{},Persistence:{get:()=>({}),set(){}},Events:{emit(){}}}};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['js/chat/emoji.js','js/chat/unread.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const list=ctx.MiniTalk.Chat.Emoji.list();
if(list.length!==12||list[0].token!==':e1:'||list[11].token!==':e12:')throw new Error('Tori emoticon inventory mismatch');
if(!ctx.MiniTalk.Chat.Emoji.isOnlyCustom(':e7:'))throw new Error('custom emoticon detection failed');
if(!ctx.MiniTalk.Chat.Emoji.isOnlyUnicode('😊'))throw new Error('unicode emoji detection failed');
console.log('CHAT_MODULES_OK');
