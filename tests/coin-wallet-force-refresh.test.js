const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map();
let resolveFirst, calls=0;
const first=new Promise(resolve=>{resolveFirst=resolve});
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{querySelectorAll:()=>[]},setTimeout,clearTimeout,localStorage:{
  getItem:k=>memory.has(k)?memory.get(k):null,
  setItem:(k,v)=>memory.set(k,String(v)),
  removeItem:k=>memory.delete(k)
}};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
}
ctx.MiniTalk.UI={Dom:{doc:()=>ctx.document}};
ctx.MiniTalk.AuthApi={coinStatus:async()=>{calls++;if(calls===1)return first;return 6}};
ctx.MiniTalk.Store.set('user',{user_id:'coin-user',isGuest:false});
vm.runInContext(fs.readFileSync(path.join(root,'js/economy/coin-wallet.js'),'utf8'),ctx,{filename:'coin-wallet.js'});
(async()=>{
  const normal=ctx.MiniTalk.Economy.CoinWallet.refresh(false);
  const forced=ctx.MiniTalk.Economy.CoinWallet.refresh(true);
  if(calls!==1)throw new Error('forced refresh must wait for the old in-flight request first');
  resolveFirst(5);
  const firstAmount=await normal;
  const forcedAmount=await forced;
  if(firstAmount!==5)throw new Error('initial balance response mismatch');
  if(calls!==2)throw new Error('force refresh reused stale in-flight balance request');
  if(forcedAmount!==6||ctx.MiniTalk.Economy.CoinWallet.value()!==6)throw new Error('fresh post-mutation balance was not applied');
  console.log('COIN_WALLET_FORCE_REFRESH_OK');
})().catch(error=>{console.error(error);process.exitCode=1});
