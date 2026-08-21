const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('js/chat/linkify.js','utf8');
const context={MiniTalk:{Chat:{}},URL};vm.createContext(context);vm.runInContext(code,context);
const L=context.MiniTalk.Chat.Linkify;
function ok(v,m){if(!v)throw new Error(m)}
const url='https://www.youtube.com/watch?v=Z4AuvzkqoXE&list=RDU4AuvzkqoXE&start_radio=1';
ok(L.youtubeId(url)==='Z4AuvzkqoXE','youtube id parse failed');
ok(L.displayText(url)==='','youtube-only message should hide raw URL');
ok(L.displayText('봐봐 '+url)==='봐봐','mixed message should keep copy and hide raw YouTube URL');
console.log('YOUTUBE_PREVIEW_CLEAN_OK');
