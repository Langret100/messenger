const fs=require('fs');
const read=file=>fs.readFileSync(file,'utf8');
const tools=read('js/features/tools.js'),chats=read('js/features/chats.js'),capture=read('js/tools/capture.js');
const shell=read('js/ui/shell.js'),profile=read('js/tools/profile-editor.js'),css=read('css/app.css'),html=read('index.html'),sw=read('sw.js'),app=read('js/app.js');
function ok(value,message){if(!value)throw new Error(message)}
ok(tools.includes('title: "놀이터"')&&tools.includes('description: "온라인 놀이학습"'),'playground tool copy is missing');
ok(tools.includes('https://langret100.github.io/multiroom-playground/')&&tools.includes('target: "_blank"')&&tools.includes('noopener noreferrer'),'playground must open safely in a new window');
ok(!tools.includes('title: "화면 캡처"')&&!tools.includes('capture: () =>'),'obsolete capture tool card remains');
ok(chats.includes('addAction("▣","캡처"')&&chats.includes('Capture.captureAndSend(roomId)'),'chat capture attachment is missing its explicit room target');
ok(!chats.includes('addAction("▦","QR"'),'QR attachment action still exists');
ok(chats.includes('MiniTalk.Realtime.isRoomMember(room)?"🔓":"🔒"')&&chats.includes('"참여 중인 비밀번호방":"잠긴 비밀번호방"'),'password room lock state icon does not reflect membership');
ok(capture.includes('async function captureAndSend(roomId = "")')&&capture.includes('String(roomId || MiniTalk.Store.get("activeRoom") || "")'),'capture service does not prioritize the open room');
ok(shell.includes('options.hostClass')&&shell.includes('options.modalClass'),'modal class options are missing');
ok(profile.includes('hostClass: "profile-modal-host"')&&chats.includes('hostClass:"profile-modal-host"'),'profile edit or view modal is not centered');
ok(css.includes('.modal-host{align-items:center;padding:14px}')&&css.includes('.header-create-button::before')&&css.includes('.header-search-button::before'),'mobile modal centering or header icon sizing is missing');
ok(css.includes('.room-lock-badge{right:-5px;bottom:-4px;min-width:0;width:auto;height:auto;border:0;border-radius:0;background:transparent;box-shadow:none'),'room lock badge still has a circular overlay');
for(const asset of ['css/app.css','js/ui/shell.js','js/features/chats.js','js/tools/profile-editor.js','js/tools/capture.js','js/features/tools.js','js/app.js'])ok(html.includes(`${asset}?v=64.4`),`stale cache version for ${asset}`);
ok(sw.includes('moaru-v64.4-playground-capture-ui-20260817')&&app.includes('sw.js?v=64.4'),'service worker v64.4 cache update is missing');
console.log('PLAYGROUND_CAPTURE_MODAL_UI_OK');
