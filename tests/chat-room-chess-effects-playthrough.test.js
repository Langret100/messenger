const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/chat/room-games.js','utf8');
const context={console,TextEncoder,TextDecoder,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),MiniTalk:{Chat:{},UI:{Dom:null},Store:{get:()=>({})}},crypto:require('crypto').webcrypto,navigator:{userAgent:''},window:{},document:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
context.MiniTalk.UI.Dom=()=>({el:()=>({})});vm.createContext(context);vm.runInContext(src,context);
const C=context.MiniTalk.Chat.RoomGames;
function ok(v,m){if(!v)throw new Error(m)}
function apply(state,from,to,promotion='q'){
  const mv=C.chessLegalMove(state,from,to,promotion);ok(mv,`illegal ${from}-${to}`);
  const next=C.chessApply(state,mv),fx=C.chessMoveFx(mv,next);return{state:next,mv,fx};
}
// normal move
let s=C.chessInitial(),r=apply(s,'e2','e4');ok(C.chessSfxName(r.fx)==='chess-move','normal move sfx');s=r.state;
// capture
s=apply(s,'d7','d5').state;r=apply(s,'e4','d5');ok(r.fx.capture&&C.chessSfxName(r.fx)==='chess-capture','capture fx');
// castle
s=C.chessInitial();for(const [a,b] of [['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6'],['f1','c4'],['g8','f6']])s=apply(s,a,b).state;r=apply(s,'e1','g1');ok(r.fx.castle==='k'&&C.chessSfxName(r.fx)==='chess-castle','castle fx');
// promotion
s=C.chessInitial();s.board=Array.from({length:8},()=>Array(8).fill(null));s.board[7][4]={c:'w',t:'k'};s.board[0][4]={c:'b',t:'k'};s.board[1][0]={c:'w',t:'p'};s.turn='w';r=apply(s,'a7','a8','n');ok(r.fx.promotion==='n'&&C.chessSfxName(r.fx)==='chess-promote','promotion fx');
// checkmate + effect
s=C.chessInitial();for(const [a,b] of [['f2','f3'],['e7','e5'],['g2','g4']])s=apply(s,a,b).state;r=apply(s,'d8','h4');ok(r.fx.check&&r.fx.mate&&C.chessSfxName(r.fx)==='chess-mate','mate fx');ok(C.chessStatus(r.state).reason==='checkmate','mate state');
// invalid move is rejected and cannot mutate state
s=C.chessInitial();const before=JSON.stringify(s);ok(!C.chessLegalMove(s,'e2','e5'),'invalid move rejected');ok(JSON.stringify(s)===before,'invalid move mutated board');
// 120 randomized legal plies across repeated games; every applied move must preserve exactly one king each.
let seed=0x12345678;const rnd=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n};
let games=0,plies=0;s=C.chessInitial();while(plies<120){const legal=C.chessLegalMoves(s,s.turn);if(!legal.length||C.chessStatus(s).ended){games++;s=C.chessInitial();continue}const mv=legal[rnd(legal.length)],next=C.chessApply(s,mv),fx=C.chessMoveFx(mv,next);ok(C.chessSfxName(fx).startsWith('chess-'),'fx mapping');for(const c of ['w','b']){let kings=0;for(const row of next.board)for(const p of row)if(p?.c===c&&p.t==='k')kings++;ok(kings===1,`${c} king count ${kings}`)}s=next;plies++}
console.log(`CHAT_ROOM_CHESS_EFFECTS_PLAYTHROUGH_OK plies=${plies} restarts=${games}`);
