const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'js/games/score-service.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
const sheetRows=[
  {user_id:'U1787530378189',username:'150|집트',score:110,rank:1},
  {user_id:'U1787530454428',username:'22',score:90,rank:2},
  {user_id:'U1787530211316',username:'담탱이',score:10,rank:3},
  {user_id:'U1787530235290',username:'1313131313131',score:10,rank:4},
  {user_id:'U1787530304908',username:'20입니다',score:10,rank:5}
];
const store={};
const ctx={console,URL,URLSearchParams,setTimeout,clearTimeout,MiniTalk:{Games:{},Persistence:{get:(k,d)=>store[k]??d,set:(k,v)=>{store[k]=v}},Store:{get:()=>({user_id:'U1787530211316',username:'담탱이',isGuest:false})},UI:{Shell:{toast:()=>{}}}},MiniTalkConfig:{sheetUrl:'https://example.test/app'},fetch:async()=>({ok:true,json:async()=>({ok:true,list:sheetRows})})};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.MiniTalk.Games.ScoreService.recordLocal('구구단게임',270,{user_id:'U1787530211316',username:'담탱이'});
(async()=>{const r=await ctx.MiniTalk.Games.ScoreService.ranking('구구단게임');ok(r.online,'must be online');ok(r.rows.length===sheetRows.length,'row count differs from sheet');for(let i=0;i<sheetRows.length;i++){const a=r.rows[i],b=sheetRows[i];ok(a.userId===b.user_id,`user id mismatch at ${i}`);ok(a.nickname===b.username,`username mismatch at ${i}`);ok(a.score===b.score,`score mismatch at ${i}`);ok(a.rank===b.rank,`rank mismatch at ${i}`);ok(!a.local,`online row marked local at ${i}`)}ok(!r.rows.some(x=>x.score===270),'local score leaked into online sheet ranking');console.log('GAME_RANKING_SHEET_PARITY_OK')})().catch(e=>{console.error(e);process.exit(1)});
