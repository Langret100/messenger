const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
function ok(v,m){if(!v)throw new Error(m)}
const state=new Map();
const ctx={console,MiniTalk:{Store:{get:k=>state.get(k),set:(k,v)=>state.set(k,v)},AuthApi:{userDirectory:async()=>[
  {user_id:'admin-1',nickname:'관리자'},
  {user_id:'student-1',nickname:'학생'},
  {user_id:'guest-old',nickname:'게스트'}
]}}};
state.set('user',{user_id:'admin-1',nickname:'관리자'});state.set('profiles',{});state.set('presence',{});
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/core/user-directory.js'),'utf8'),ctx);
(async()=>{
  const normal=await ctx.MiniTalk.UserDirectory.refresh(true);
  ok(!normal.some(x=>x.user_id==='admin-1'),'ordinary directory must still exclude self');
  const adminRows=ctx.MiniTalk.UserDirectory.all({includeSelf:true});
  ok(adminRows.some(x=>x.user_id==='admin-1'&&x.nickname==='관리자'),'admin directory did not include signed-in user');
  ok(!adminRows.some(x=>/^guest-/i.test(x.user_id)),'guest leaked into admin directory');
  const admin=fs.readFileSync(path.join(root,'js/features/admin.js'),'utf8');
  ok(admin.includes('all?.({includeSelf:true})'),'full admin target list is not requesting self-inclusive directory');
  const server=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
  const start=server.indexOf('function handleShopDeliveryList(e)');
  const end=server.indexOf('\n}',start);
  const body=server.slice(start,end+2);
  ok(start>=0&&body.includes('readShopInventorySheetItems_()'),'shop manager delivery list missing');
  ok(!/ownerId\s*!==\s*p\.user_id|userId\s*!==\s*p\.user_id|owner_id\s*!==\s*p\.user_id/.test(body),'shop manager delivery list excludes manager self');
  console.log('ADMIN_SELF_USER_DIRECTORY_OK');
})().catch(e=>{console.error(e);process.exit(1)});
