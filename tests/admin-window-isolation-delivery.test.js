const fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const admin=read("js/features/admin.js"),dom=read("js/ui/dom.js"),shell=read("js/ui/shell.js"),realtime=read("js/adapters/realtime.js"),windowMode=read("js/adapters/window-mode.js");
const ok=(condition,message)=>{if(!condition)throw new Error(message)};

ok(dom.includes("forDocument(doc)"),"document-bound DOM helper is missing");
ok(shell.includes("function forDocument(doc)")&&shell.includes("modalCloseTimers=new WeakMap"),"document-bound shell/modal isolation is missing");
ok(admin.includes("queueMicrotask(returnMessengerToChats)")&&admin.includes('MiniTalk.Router.go("chats")'),"original messenger does not return to chats after opening admin window");
ok(!admin.includes('MiniTalk.Store.set("rootDocument",doc)')&&!admin.includes("host.replaceChildren();popup.addEventListener"),"admin popup still steals or blanks the original messenger document");
ok(admin.includes("MiniTalk.UI.Dom.forDocument(hostDoc)")&&admin.includes("MiniTalk.UI.Shell.forDocument(hostDoc)"),"admin popup rendering is not document-scoped");
ok(realtime.includes("commandSignalRoom")&&realtime.includes("notifyCommandTargets")&&realtime.includes("pollServerCommands()"),"Firebase immediate command wake-up is missing");
ok(admin.includes('type.value==="STAMP"?{imageUrl:"assets/ui/quest-stamp.png"}')&&admin.includes("MiniTalk.Chat.Attachments.image")&&admin.includes("selectedEffectImage"),"stamp/image effect picker is incomplete");
ok(windowMode.includes("MiniTalk.Features.Auth?.logout?.()")&&windowMode.includes("PiP 닫기는 메신저 종료"),"PiP close does not log out the original tab");
console.log("ADMIN_WINDOW_ISOLATION_DELIVERY_OK");
