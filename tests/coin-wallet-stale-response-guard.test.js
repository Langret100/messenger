const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map();let resolveOld,calls=0;const oldRequest=new Promise(resolve=>{resolveOld=resolve});
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{querySelectorAll:()=>[]},setTimeout,clearTimeout,localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.UI={Dom:{doc:()=>ctx.document}};ctx.MiniTalk.AuthApi={coinStatus:async()=>{calls++;if(calls===1)return oldRequest;return 7}};ctx.MiniTalk.Store.set('user',{user_id:'coin-race',isGuest:false});
vm.runInContext(fs.readFileSync(path.join(root,'js/economy/coin-wallet.js'),'utf8'),ctx,{filename:'coin-wallet.js'});
(async()=>{
 const W=ctx.MiniTalk.Economy.CoinWallet;const pending=W.refresh(false);if(calls!==1)throw new Error('initial refresh missing');
 // 구매 성공 응답이 먼저 도착: 서버가 확정해 준 새 잔액을 즉시 반영한다.
 W.setLocal(7,'purchase');if(W.value()!==7)throw new Error('purchase balance was not applied immediately');
 // 구매 전에 시작된 오래된 coinStatus(10)가 늦게 와도 7을 되돌리면 안 된다.
 resolveOld(10);const staleResult=await pending;if(W.value()!==7)throw new Error('stale in-flight coin response overwrote purchase balance: '+W.value());
 if(staleResult!==7)throw new Error('stale refresh should resolve to current authoritative balance');
 const fresh=await W.refresh(true);if(fresh!==7||W.value()!==7||calls!==2)throw new Error('forced fresh balance check failed');
 console.log('COIN_WALLET_STALE_RESPONSE_GUARD_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
