const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const rules=JSON.parse(fs.readFileSync(path.join(root,'database.rules.json'),'utf8'));
const rawRules=fs.readFileSync(path.join(root,'database.rules.json'),'utf8');
for(const unsupported of ['numChildren(']){
  if(rawRules.includes(unsupported))throw new Error(`unsupported Realtime Database Rules API remains: ${unsupported}`);
}

const rootRules=rules?.rules;
for(const pathName of ['socialChat','profiles','rooms','fcm_tokens','fcm_active_room'])if(rootRules?.[pathName]?.['.read']!==true)throw new Error(`legacy Firebase ${pathName} must preserve the Sheet-login compatibility path`);
if(rootRules?.socialChatRooms?.$roomId?.['.read']!==true)throw new Error('socialChatRooms room-listener compatibility is missing');
for(const value of [rootRules?.socialChat?.$msgId?.['.write'],rootRules?.socialChatRooms?.$roomId?.$msgId?.['.write'],rootRules?.rooms?.$roomId?.['.write'],rootRules?.profiles?.$nickname?.['.write']])if(value!==true)throw new Error('legacy Firebase writes must preserve the existing Sheet-login client flow');
const v3=rules?.rules?.moaru?.v3;
for(const pathName of ['presence','profiles','messages'])if(v3?.[pathName]?.['.read']!==true||v3?.[pathName]?.['.write']!==true)throw new Error(`Firebase v3 ${pathName} must follow the Apps-Script-login/public-realtime model`);
for(const pathName of ['questProgress','feedState','feedMedia','classInfo','fridayMission'])if(v3?.[pathName]?.['.read']!==true)throw new Error(`Firebase v3 ${pathName} read must not depend on Firebase anonymous auth`);
for(const pathName of ['commands','tasks','shop'])if(v3?.[pathName]?.['.read']!==false||v3?.[pathName]?.['.write']!==false)throw new Error(`Firebase v3 ${pathName} must stay closed in favor of the server-validated API`);
if(!v3?.messages?.$roomId?.['.indexOn']?.includes('ts'))throw new Error('message timestamp index is missing');
if(rules?.rules?.mini_talk)throw new Error('legacy mini_talk namespace must not remain in Firebase rules');
const realtime=fs.readFileSync(path.join(root,'js/adapters/realtime.js'),'utf8');
if(realtime.includes('firebase-auth-compat.js')||realtime.includes('signInAnonymously')||realtime.includes('ensureFirebaseAuth'))throw new Error('Firebase anonymous authentication must not be bootstrapped');
if(!realtime.includes('validKey()&&!nextUser?.isGuest'))throw new Error('guest users must not connect to Firebase');
if(!realtime.includes('사용자 신원 확인은 Apps Script 로그인에서 끝냅니다'))throw new Error('Apps Script login ownership policy is not documented in realtime adapter');
if(realtime.includes('db.ref(`${MiniTalkConfig.paths.commands}')||realtime.includes('db.ref(`${MiniTalkConfig.paths.tasks}'))throw new Error('client must not read or write unverified Firebase admin paths');
if(realtime.includes('migrateLegacyNamespace')||realtime.includes('mini_talk/v3'))throw new Error('legacy mini_talk migration code must not remain');
console.log('FIREBASE_RULES_OK');
