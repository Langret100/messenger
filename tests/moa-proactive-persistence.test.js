const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/features/moa-chat.js','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function node(tag,attrs={},children=[]){
  const n={tag,attrs:{...attrs},className:attrs.class||'',dataset:{},children:[],isConnected:true,textContent:attrs.text||'',append(...xs){this.children.push(...xs.filter(Boolean))},prepend(...xs){this.children.unshift(...xs.filter(Boolean))},remove(){this.isConnected=false},querySelector(sel){
    const match=x=>sel[0]==='.'?String(x.className||'').split(/\s+/).includes(sel.slice(1)):false;
    const walk=x=>{for(const c of x.children||[]){if(match(c))return c;const f=walk(c);if(f)return f}return null};return walk(this);
  }};
  for(const [k,v] of Object.entries(attrs)){if(k.startsWith('data-'))n.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);if(k==='onclick')n.onclick=v}
  n.append(...children);return n;
}
(async()=>{
  let stored=[];let puts=0;const Dom={el:node,doc:()=>({}),one(){return null},byId(){return null}};
  const ctx={
    console,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},
    document:{visibilityState:'visible',querySelector(){return null},addEventListener(){}},
    MiniTalk:{
      Features:{},UI:{Dom,Shell:{}},
      Store:{get(k){if(k==='user')return{user_id:'u1',isGuest:false};return null}},
      DataCache:{async get(){return stored.slice()},async put(_bucket,_key,value){puts++;await sleep(45);stored=value.map(x=>({...x}))}},
      Persistence:{get(){return null},remove(){}},Router:{go(){}},
      AI:{MoaCommunicationEngine:{maybeConnectionGreeting(){return{reply:'먼저 인사할게',candidateId:'g1',topic:''}},maybeInitiate(){return null}}},
      Registry:{register(){}}
    }
  };
  vm.createContext(ctx);vm.runInContext(src,ctx);
  const chat=ctx.MiniTalk.Features.MoaChat;
  const first=chat.listItem();
  await sleep(8);
  ok(first.dataset.unread==='0','unread must not appear before proactive message persistence finishes');
  const second=chat.listItem();
  await sleep(85);
  ok(puts===1,'rapid list refresh must not create a second proactive message while the first write is pending');
  ok(stored.length===1&&stored[0].text==='먼저 인사할게'&&stored[0].unread===true,'proactive message was not durably stored');
  ok(first.dataset.unread==='1'&&second.dataset.unread==='1','persisted proactive message must update list unread state');
  ok(first.querySelector('.conversation-preview').textContent==='먼저 인사할게','list preview must match persisted message');
  console.log('MOA_PROACTIVE_PERSISTENCE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
