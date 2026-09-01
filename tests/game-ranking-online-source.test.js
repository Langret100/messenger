const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'js/games/score-service.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(code.includes('온라인 조회가 성공한 경우에는 구글 시트가 유일한 랭킹 원본입니다.'),'online ranking source guard missing');
ok(code.includes('return { rows: remote, online: true };'),'online ranking must return remote rows only');
ok(!code.includes('return { rows: merge(list.map(normalizeRemote), local), online: true };'),'local scores still merged into online ranking');

const store={};
const ctx={console,URL,URLSearchParams,setTimeout,clearTimeout,MiniTalk:{Games:{},Persistence:{get:(k,d)=>store[k]??d,set:(k,v)=>{store[k]=v}},Store:{get:()=>({user_id:'U1',username:'sheet-user',isGuest:false})},UI:{Shell:{toast:()=>{}}}},MiniTalkConfig:{sheetUrl:'https://example.test/app'},fetch:async()=>({ok:true,json:async()=>({list:[{user_id:'U1',username:'sheet-user',score:10,rank:3},{user_id:'U2',username:'other',score:90,rank:2}]})})};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.MiniTalk.Games.ScoreService.recordLocal('구구단게임',270,{user_id:'U1',username:'local-user'});
(async()=>{const r=await ctx.MiniTalk.Games.ScoreService.ranking('구구단게임');ok(r.online===true,'online flag false');ok(r.rows.length===2,'local row leaked into online rows');ok(r.rows.some(x=>x.userId==='U1'&&x.score===10&&x.nickname==='sheet-user'&&!x.local),'sheet row was not preserved');ok(!r.rows.some(x=>x.score===270),'local 270 score contaminated sheet ranking');console.log('GAME_RANKING_ONLINE_SOURCE_OK')})().catch(e=>{console.error(e);process.exit(1)});
