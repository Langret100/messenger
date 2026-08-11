const fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const calls=[];
let rejectPurchase=false;
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout};
ctx.window=ctx;
vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
}
ctx.MiniTalk.Economy={CoinWallet:{refresh:async()=>{calls.push(['coin-refresh']);return 100},setLocal:(value,source)=>calls.push(['coin',value,source])}};
ctx.MiniTalk.AuthApi={
  shopPurchase:async payload=>{calls.push(['purchase',payload]);if(rejectPurchase)throw new Error('server rejected');return{ok:true,newCoin:75}},
  shopCatalog:async()=>[{id:'server-product',name:'서버 상품',price:40,description:'서버 저장',image_url:'https://example.com/product.webp'}],
  shopSaveProduct:async(userId,token,product)=>{calls.push(['save-product',userId,token,product]);return{ok:true,product}},
  shopDeleteProduct:async(userId,token,id)=>{calls.push(['delete-product',userId,token,id]);return{ok:true}}
};
ctx.MiniTalk.AdminSession={requireToken:()=> 'admin-token'};
ctx.MiniTalk.UserDirectory={all:()=>Object.values(ctx.MiniTalk.Store.get('profiles')||{}).filter(row=>row.user_id!=='user-a'&&!row.user_id.startsWith('guest-'))};
ctx.MiniTalk.Realtime={
  addShopInventory:async(owner,item)=>calls.push(['add',owner,item]),
  useShopInventory:async id=>calls.push(['use',id]),
  giftShopInventory:async(id,target,nickname)=>calls.push(['gift',id,target,nickname])
};
vm.runInContext(fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8'),ctx,{filename:'js/shopping/store-service.js'});

(async()=>{
  const service=ctx.MiniTalk.Shopping.StoreService;
  const longImage='data:image/webp;base64,'+'A'.repeat(2000);
  if(service.normalizeProduct({id:'image',name:'이미지',price:1,imageUrl:longImage}).imageUrl!==longImage)throw new Error('compressed product image was truncated');
  ctx.MiniTalk.Store.set('user',{user_id:'guest-test',nickname:'게스트',isGuest:true});
  let guestBlocked=false;
  try{await service.purchase({id:'p1',name:'연필',price:25})}catch{guestBlocked=true}
  if(!guestBlocked)throw new Error('guest purchase must be blocked');

  ctx.MiniTalk.Store.set('user',{user_id:'user-a',nickname:'가람',isGuest:false});
  ctx.MiniTalk.Store.set('shopCatalog',{
    expensive:{id:'expensive',name:'노트',description:'줄 노트',price:50},
    cheap:{id:'cheap',name:'연필',description:'연필 한 자루',price:25}
  });
  if(service.products().map(x=>x.id).join(',')!=='cheap,expensive')throw new Error('products must sort by price');

  const now=Date.now();
  ctx.MiniTalk.Store.set('shopInventory',{
    ready:{id:'ready',name:'연필',createdAt:now},
    recent:{id:'recent',name:'노트',createdAt:now-10,usedAt:now-2*86400000},
    expired:{id:'expired',name:'지우개',createdAt:now-20,usedAt:now-8*86400000}
  });
  const visible=service.inventory(now).map(x=>x.id);
  if(!visible.includes('ready')||!visible.includes('recent')||visible.includes('expired'))throw new Error('used-item seven-day visibility is invalid');

  ctx.MiniTalk.Store.set('profiles',{
    me:{user_id:'user-a',nickname:'가람'},
    other:{user_id:'user-b',nickname:'나래'},
    guest:{user_id:'guest-old',nickname:'게스트'}
  });
  if(service.recipients().map(x=>x.user_id).join(',')!=='user-b')throw new Error('gift recipients must exclude self and guests');

  await service.purchase({id:'cheap',name:'연필',description:'연필 한 자루',price:25});
  if(!calls.some(x=>x[0]==='purchase')||!calls.some(x=>x[0]==='add'&&x[1]==='user-a'))throw new Error('approved purchase must add inventory');
  if(calls.some(x=>x[0]==='coin-refresh'))throw new Error('purchase must not make a redundant balance request before the authoritative server purchase');
  if(!calls.some(x=>x[0]==='coin'&&x[1]===75))throw new Error('newCoin response must update the wallet');
  const addCount=calls.filter(x=>x[0]==='add').length;
  rejectPurchase=true;
  try{await service.purchase({id:'expensive',name:'노트',price:50})}catch{}
  if(calls.filter(x=>x[0]==='add').length!==addCount)throw new Error('rejected purchase must not add inventory');
  rejectPurchase=false;
  await service.use('ready');
  await service.gift('ready','user-b');
  if(!calls.some(x=>x[0]==='use'&&x[1]==='ready'))throw new Error('use action was not forwarded');
  if(!calls.some(x=>x[0]==='gift'&&x[2]==='user-b'))throw new Error('gift action was not forwarded');

  await service.refreshCatalog(true);
  if(service.products().map(x=>x.id).join(',')!=='server-product')throw new Error('catalog must load from the server API');
  if(service.products()[0].imageUrl!=='https://example.com/product.webp')throw new Error('server product image URL was not normalized');
  await service.saveProduct({name:'새 상품',price:10,description:'관리자 등록',imageUrl:'data:image/webp;base64,AAAA'});
  if(!service.products().some(item=>item.name==='새 상품'&&item.imageUrl==='data:image/webp;base64,AAAA'))throw new Error('saved product image must be applied to the catalog immediately');
  await service.deleteProduct('server-product');
  if(!calls.some(x=>x[0]==='save-product'&&x[2]==='admin-token'))throw new Error('server product save requires admin token');
  if(!calls.some(x=>x[0]==='save-product'&&x[3].imageUrl==='data:image/webp;base64,AAAA'))throw new Error('compressed product image must be saved with the server product');
  if(!calls.some(x=>x[0]==='delete-product'&&x[3]==='server-product'))throw new Error('server product delete was not called');

  console.log('SHOPPING_STORE_OK',service.products().length,'products',service.inventory(now).length,'visible items');
})().catch(error=>{console.error(error);process.exitCode=1});
