const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.resolve(__dirname,'../js/adapters/auth-api.js'),'utf8');
(async()=>{
  let calls=0;
  const MiniTalk={};
  const ctx={
    console, MiniTalk, MiniTalkConfig:{sheetUrl:'https://example.test/exec'}, URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch:async()=>{
      calls++;
      if(calls===1)return {ok:false,status:404};
      return {ok:true,status:200,json:async()=>({ok:true,user_id:'u1',nickname:'학생'})};
    }
  };
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
  const user=await ctx.MiniTalk.AuthApi.login('id','pw');
  if(calls!==2||user.user_id!=='u1')throw new Error('transient HTTP retry did not recover login');
  console.log('AUTH_API_TRANSIENT_HTTP_RETRY_OK');
})().catch(e=>{console.error(e);process.exit(1)});
