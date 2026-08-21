const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
let unlockCalls=0;
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},setTimeout,clearTimeout};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
}
ctx.MiniTalk.AuthApi={adminUnlock:async(userId,code)=>{unlockCalls++;if(code!=='valid-code')throw new Error('ADMIN_AUTH_FAILED');return{ok:true,admin:true,admin_token:'server-token',expires_in:3600}}};
vm.runInContext(fs.readFileSync(path.join(root,'js/admin/session.js'),'utf8'),ctx,{filename:'js/admin/session.js'});

(async()=>{
  const session=ctx.MiniTalk.AdminSession;
  ctx.MiniTalk.Store.set('user',{user_id:'guest-one',isGuest:true});
  let guestBlocked=false;
  try{await session.unlock('valid-code')}catch{guestBlocked=true}
  if(!guestBlocked||unlockCalls!==0)throw new Error('guest admin unlock must be blocked before server request');

  ctx.MiniTalk.Store.set('user',{user_id:'user-one',isGuest:false});
  let invalidBlocked=false;
  try{await session.unlock('wrong-code')}catch{invalidBlocked=true}
  if(!invalidBlocked||session.authorized())throw new Error('invalid admin code must be rejected');

  await session.unlock('valid-code');
  if(!session.authorized()||ctx.MiniTalk.Store.get('admin')!==true||session.token()!=='server-token')throw new Error('valid admin session was not activated');
  session.clear();
  if(session.authorized()||ctx.MiniTalk.Store.get('admin')!==false)throw new Error('admin session must clear on logout');
  console.log('ADMIN_SESSION_OK');
})().catch(error=>{console.error(error);process.exitCode=1});
