const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'docs/apps-script');
const expected=['Code.gs','coin.gs','social_chat.gs','CHAT_ROOMS_MESSENGER.gs','social_upload_directurl.gs','FCM_PUSH_HANDLER.gs','coin-shopping-extension.gs'];
const sources=expected.map(name=>[name,fs.readFileSync(path.join(dir,name),'utf8')]);
new vm.Script(sources.map(([name,source])=>`\n/* ${name} */\n${source}`).join('\n'),{filename:'apps-script-bundle.gs'});
const definitions=new Map();
for(const [name,source] of sources)for(const match of source.matchAll(/^\s*function\s+([A-Za-z0-9_$]+)\s*\(/gm)){const list=definitions.get(match[1])||[];list.push(name);definitions.set(match[1],list)}
const duplicates=[...definitions].filter(([,files])=>files.length>1);if(duplicates.length)throw new Error(`duplicate Apps Script functions: ${JSON.stringify(duplicates)}`);
const all=sources.map(([,source])=>source).join('\n'),index=fs.readFileSync(path.join(dir,'Index.html'),'utf8');
if(all.includes('BEGIN PRIVATE KEY'))throw new Error('FCM private key must not remain in source');
for(const key of ['FCM_PROJECT_ID','FCM_SERVICE_ACCOUNT_EMAIL','FCM_PRIVATE_KEY'])if(!sources.find(([name])=>name==='FCM_PUSH_HANDLER.gs')[1].includes(`getProperty("${key}")`))throw new Error(`FCM ${key} must come from Script Properties`);
if(/const\s+PASSWORD\s*=/.test(index)||!index.includes('processCoinChangeAuthorized'))throw new Error('coin management page must validate the administrator code on the server');
const chat=sources.find(([name])=>name==='social_chat.gs')[1],upload=sources.find(([name])=>name==='social_upload_directurl.gs')[1];
if(chat.includes('function handleSocialUploadImage_')||!upload.includes('function handleSocialUploadImage_'))throw new Error('duplicate upload handler cleanup failed');
if(!all.includes('getSheetByName("대화방")')||/insertSheet\("미니톡_대화방백업"\)/.test(all))throw new Error('chat backup must reuse 대화방 without recreating the obsolete sheet');
if(!all.includes('function removeObsoleteMiniTalkRoomBackupSheetOnce()'))throw new Error('one-time obsolete backup cleanup is missing');
console.log('APPS_SCRIPT_BUNDLE_OK 8 files');
