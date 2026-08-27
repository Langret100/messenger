const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'js/features/shopping.js'),'utf8'),ok=(v,m)=>{if(!v)throw new Error(m)};
class El{
  constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.disabled=false;this.textContent='';this.className='';this.isConnected=true;}
  append(...nodes){for(const n of nodes.flat()){if(n==null)continue;this.children.push(n);if(typeof n==='object')n.parentNode=this;}return this}
  replaceChildren(...nodes){this.children=[];return this.append(...nodes)}
  querySelectorAll(sel){const out=[];const visit=n=>{if(!n||typeof n!=='object')return;if(sel==='button'&&n.tagName==='BUTTON')out.push(n);(n.children||[]).forEach(visit)};this.children.forEach(visit);return out}
}
const D={el(tag,attrs={},children=[]) {const e=new El(tag);for(const [k,v] of Object.entries(attrs||{})){if(k==='text')e.textContent=String(v);else if(k==='class')e.className=String(v);else e[k]=v;}e.append(...(Array.isArray(children)?children:[children]));return e;},byId(){return null}};
let listCalls=0,completeCalls=0,toast='';
const ctx={console,setTimeout,clearTimeout,Audio:function(){},window:{AudioContext:function(){}},MiniTalk:{Features:{},Shopping:{StoreService:{products:()=>[],inventory:()=>[],recipients:()=>[],enter:async()=>[],leave(){}}},Events:{on(){}},UI:{Dom:D,Shell:{toast:t=>toast=t,modal(){},closeModal(){},setHeader(){}}},Store:{get:k=>k==='user'?{user_id:'admin1'}:k==='route'?'admin':{}},Registry:{register(){}},AdminSession:{requireToken:()=> 'token',clear(){}},Realtime:{notifyCommandTargets(){}},AuthApi:{shopDeliveryList:async()=>{listCalls++;return[{id:'inv1',ownerId:'u1',nickname:'학생',name:'연필',status:'requested'}]},shopDeliveryComplete:async()=>{completeCalls++;return{deliveryStatus:'completed'}},shopDeliveryCancel:async()=>({deliveryStatus:'cancelled'}),shopDeliveryShipping:async()=>({deliveryStatus:'shipping'})}}};
ctx.window=Object.assign(ctx.window,ctx);vm.createContext(ctx);vm.runInContext(src,ctx,{filename:'shopping.js'});
(async()=>{const panel=ctx.MiniTalk.Features.Shopping.deliveryAdminPanel({Dom:D,Shell:ctx.MiniTalk.UI.Shell});await new Promise(r=>setTimeout(r,0));
  const buttons=panel.querySelectorAll('button'),complete=buttons.find(b=>b.textContent==='배송완료');ok(complete,'complete button missing');ok(listCalls===1,'initial delivery list should load once');
  await complete.onclick();await new Promise(r=>setTimeout(r,0));ok(completeCalls===1,'complete mutation did not run exactly once');ok(listCalls===1,'complete triggered a second full delivery-list refresh');
  ok(panel.querySelectorAll('button').filter(b=>b.textContent==='배송완료').length===0,'completed row stayed in list');ok(/배송완료/.test(toast),'completion feedback missing');
  console.log('ADMIN_DELIVERY_NO_REFRESH_RUNTIME_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
