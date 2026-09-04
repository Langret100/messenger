const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={MiniTalk:{Chat:{}},console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/chat/emoji.js'),'utf8'),ctx,{filename:'js/chat/emoji.js'});
const emoji=ctx.MiniTalk.Chat.Emoji;
const mustBubble=['???','!!!','...','ㅋㅋ','ㅎㅎ','ㅇㅇ','ㅇㅈ','ㄴㄴ','ㅠㅠ','ㅜㅜ','^_^','-_-','ㄱㄱ','ㅂㅂ','ㅇ ㅈ'];
for(const value of mustBubble){if(emoji.isOnlyUnicode(value))throw new Error(`ordinary chat text lost bubble: ${value}`)}
const mustFloat=['😀','😂😂','❤️','👍🏻','👨‍👩‍👧‍👦','🇰🇷','1️⃣','🔥 ✨'];
for(const value of mustFloat){if(!emoji.isOnlyUnicode(value))throw new Error(`emoji-only message did not float: ${value}`)}
if(!emoji.isOnlyCustom(':e13:','')||!emoji.isOnlyCustom('웃음','e13'))throw new Error('custom emoticon-only detection regressed');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(!index.includes('js/chat/emoji.js?v='))throw new Error('emoji module cache version is stale');
console.log('CHAT_EMOJI_BUBBLE_CLASSIFICATION_OK');
