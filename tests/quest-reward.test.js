const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map(),requests=[],toasts=[];
let refreshCalls=0;
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},URLSearchParams,setTimeout,clearTimeout,
  fetch:async(url,options)=>{
    requests.push({url,body:String(options.body),headers:options.headers||{}});
    return {ok:true,json:async()=>({ok:true,applied:true})};
  },
  localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Economy={CoinWallet:{refresh:async(force)=>{if(force!==true)throw new Error('reward must force a fresh balance read');refreshCalls++;return 2}}};
ctx.MiniTalk.UI={Shell:{toast:m=>toasts.push(m)}};
vm.runInContext(fs.readFileSync(path.join(root,'js/economy/quest-reward.js'),'utf8'),ctx,{filename:'js/economy/quest-reward.js'});
ctx.MiniTalk.Store.set('user',{user_id:'reward-user',nickname:'보상 테스트'});
(async()=>{
  await ctx.MiniTalk.Economy.QuestReward.ensure('math','2026-08-11');
  await ctx.MiniTalk.Economy.QuestReward.ensure('math','2026-08-11');
  await ctx.MiniTalk.Economy.QuestReward.ensure('korean','2026-08-11');
  if(requests.length!==2)throw new Error('each subject must be rewarded once per day');
  if(refreshCalls<2)throw new Error('server coin balance was not reconciled after subject reward');
  if(!requests[0].body.includes('mode=coin_reward')||!requests[0].body.includes('reward_type=QUEST_5CLEAR')||!requests[0].body.includes('reward_key=2026-08-11%3Amath'))throw new Error('math reward payload is invalid');
  if(!requests[1].body.includes('reward_key=2026-08-11%3Akorean'))throw new Error('Korean reward key is not separated');
  if(!String(requests[0].headers['Content-Type']||'').includes('application/x-www-form-urlencoded'))throw new Error('coin reward content type missing');
  if(!toasts.some(v=>/코인 1개 적립/.test(v)))throw new Error('reward success was not surfaced to the user');
  console.log('QUEST_REWARD_RECONCILE_OK',requests.length,'subject rewards');
})().catch(error=>{console.error(error);process.exitCode=1});
