const fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','js/games/score-service.js'),'utf8');
const memory=new Map();
const toasts=[];
let calls=0,mode='busy';
const ctx={console,URL,URLSearchParams,TypeError,setTimeout:(fn)=>{fn();return 1},clearTimeout(){},MiniTalkConfig:{sheetUrl:'https://example.invalid/score'},fetch:async()=>{calls++;if(mode==='busy'){return {ok:true,status:200,json:async()=>calls<3?{ok:false,error:'GAME_SCORE_BUSY'}:{ok:true}}}if(mode==='network'){if(calls<3)throw new TypeError('network');return {ok:true,status:200,json:async()=>({ok:true})}}return {ok:true,status:200,json:async()=>({ok:false,error:'BAD_REQUEST'})}},MiniTalk:{Persistence:{get:(k,d)=>memory.has(k)?memory.get(k):d,set:(k,v)=>memory.set(k,v)},Store:{get:()=>({user_id:'u1',nickname:'학생'})},UI:{Shell:{toast:m=>toasts.push(m)}},Games:{}}};
vm.createContext(ctx);vm.runInContext(code,ctx);
(async()=>{
  calls=0;mode='busy';let ok=await ctx.MiniTalk.Games.ScoreService.submit('수학탐험대',1234);if(!ok||calls!==3)throw new Error(`GAME_SCORE_BUSY must retry to success, calls=${calls}`);
  calls=0;mode='network';ok=await ctx.MiniTalk.Games.ScoreService.submit('수학탐험대',1300);if(!ok||calls!==3)throw new Error(`network failure must retry, calls=${calls}`);
  calls=0;mode='bad';ok=await ctx.MiniTalk.Games.ScoreService.submit('수학탐험대',1400);if(ok||calls!==1)throw new Error(`non-retryable rejection must stop immediately, calls=${calls}`);
  if(!ctx.MiniTalk.Games.ScoreService.localRanking('수학탐험대').some(r=>r.score===1400))throw new Error('failed online score must remain in local best record');
  console.log('GAME_SCORE_RETRY_OK');
})().catch(e=>{console.error(e);process.exit(1)});
