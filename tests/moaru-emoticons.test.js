const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"..");
const emoji=fs.readFileSync(path.join(root,"js/chat/emoji.js"),"utf8");
const chats=fs.readFileSync(path.join(root,"js/features/chats.js"),"utf8");
const realtime=fs.readFileSync(path.join(root,"js/adapters/realtime.js"),"utf8");
for(let number=13;number<=17;number++){
  const file=path.join(root,"assets/emoticons",`e${number}.png`),data=fs.readFileSync(file);
  if(data.length>70000)throw new Error(`e${number} is too large: ${data.length}`);
  if(data.readUInt32BE(16)!==192||data.readUInt32BE(20)!==192)throw new Error(`e${number} must be 192x192`);
  if(data[25]!==6)throw new Error(`e${number} must be an RGBA PNG`);
}
for(const label of ["웃음","좌절","졸림","한심","기쁨"]){if(!emoji.includes(label))throw new Error(`fallback label missing: ${label}`)}
if(!chats.includes("text:info.fallback||info.token")||!chats.includes("emoticon:info.fallback?info.code:null"))throw new Error("fallback text is not sent with new emoticons");
if(!realtime.includes("emoticon:payload.emoticon||null"))throw new Error("emoticon code is not persisted with messages");
console.log("MOARU_EMOTICONS_OK 5");
