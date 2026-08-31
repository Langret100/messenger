const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/chat/room-games.js','utf8');
const context={console,TextEncoder,TextDecoder,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),MiniTalk:{Chat:{},UI:{Dom:null},Store:{get:()=>({})}},crypto:require('crypto').webcrypto,navigator:{userAgent:''},window:{},document:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
context.MiniTalk.UI.Dom=()=>({el:()=>({})});vm.createContext(context);vm.runInContext(src,context);
const C=context.MiniTalk.Chat.RoomGames;
function ok(v,m){if(!v)throw new Error(m)}
function move(state,from,to,promotion='q'){const m=C.chessLegalMove(state,from,to,promotion);ok(m,`illegal ${from}-${to}`);return C.chessApply(state,m)}
let s=C.chessInitial();
ok(s.turn==='w','white starts');ok(C.chessLegalMove(s,'e2','e4'),'e2-e4 legal');ok(!C.chessLegalMove(s,'e2','e5'),'e2-e5 illegal');
s=move(s,'e2','e4');ok(s.turn==='b'&&s.ep==='e3','double pawn state');s=move(s,'e7','e5');s=move(s,'g1','f3');s=move(s,'b8','c6');s=move(s,'f1','c4');s=move(s,'g8','f6');ok(C.chessLegalMove(s,'e1','g1'),'white king-side castle legal');s=move(s,'e1','g1');ok(s.board[7][6]?.t==='k'&&s.board[7][5]?.t==='r','castle pieces placed');
s=C.chessInitial();s=move(s,'f2','f3');s=move(s,'e7','e5');s=move(s,'g2','g4');s=move(s,'d8','h4');let st=C.chessStatus(s);ok(st.ended&&st.reason==='checkmate'&&st.winner==='b','checkmate detection');
s=C.chessInitial();s=move(s,'e2','e4');s=move(s,'a7','a6');s=move(s,'e4','e5');s=move(s,'d7','d5');ok(C.chessLegalMove(s,'e5','d6'),'en passant legal');s=move(s,'e5','d6');ok(s.board[3][3]===null&&s.board[2][3]?.t==='p','en passant capture applied');
s=C.chessInitial();s.board=Array.from({length:8},()=>Array(8).fill(null));s.board[7][4]={c:'w',t:'k'};s.board[0][4]={c:'b',t:'k'};s.board[1][0]={c:'w',t:'p'};s.turn='w';let pm=C.chessLegalMove(s,'a7','a8','n');ok(pm&&pm.promotion==='n','promotion move');s=C.chessApply(s,pm);ok(s.board[0][0]?.t==='n','promotion applied');
console.log('CHAT_ROOM_CHESS_OK');
