const fs=require('fs');
const source=fs.readFileSync('js/features/auth.js','utf8');
function ok(value,message){if(!value)throw new Error(message)}
ok(source.includes('id===String(rememberedUser.username||"")&&!password'),'saved session reuse is missing');
ok(source.includes('placeholder="${hasSession?"••••••••":"비밀번호"}"'),'remembered password mask is missing');
ok(source.includes('MiniTalk.Persistence.set(LAST_ID_KEY,user.username)'),'last username is not remembered');
ok(!/Persistence\.set\([^\n]*(?:password|authPw)/.test(source),'plaintext password must not be persisted');
ok(source.includes('MiniTalk.WindowMode.openForLogin()'),'login click must request always-on-top mode');
console.log('AUTH_SESSION_UI_OK');
