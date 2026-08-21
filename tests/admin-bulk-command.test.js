const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.resolve(__dirname,"..");
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const admin=read("js/features/admin.js"),realtime=read("js/adapters/realtime.js"),auth=read("js/adapters/auth-api.js"),server=read("docs/apps-script/coin-shopping-extension.gs"),code=read("docs/apps-script/Code.gs");
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(admin.includes("전체 선택")&&admin.includes("선택 해제")&&admin.includes("data-admin-user"),"admin user checklist controls are missing");
ok(admin.includes('["COIN_REWARD","코인 증감 (+/−)"]')&&admin.includes("adminCoinReward")&&admin.includes("adminUserBalances")&&admin.includes("admin-target-coin"),"admin signed coin UI missing");
ok(realtime.includes("async function sendCommands")&&realtime.includes("async function assignTasks"),"realtime bulk methods missing");
ok(auth.includes('mode: "admin_coin_reward"')&&auth.includes('mode: "admin_user_balances"')&&code.includes('case "admin_coin_reward"')&&code.includes('case "admin_user_balances"'),"admin coin server routes incomplete");
ok(server.includes('amount === 0 || Math.abs(amount) > 100000')&&server.includes('function moaruAdminCoinChangeGuarded_')&&server.includes('const newCoin = beforeCoin + delta')&&server.includes('Object.prototype.hasOwnProperty.call(rewardCoins, id)'),"signed admin coin validation or negative-capable ledger missing");
ok(!admin.includes('Math.max(0,Math.floor(Number(row.coin)||0))')&&!admin.includes('Math.max(0,Number(row.newCoin)||0)'),"admin UI still clamps negative balances");
ok(!server.includes('"1029384756!"'),"hard-coded admin code remains");
// Directly verify that the admin-only coin helper can cross below zero.
const rows=[["u1","학생",2]];
const ctx={console,REWARD_SHEET:"보상",COL_REWARD_USER_ID:1,COL_REWARD_COIN:3,getSheet_:()=>({getLastRow:()=>2,getRange:(r,c,n,m)=>({getValues:()=>rows,setValue:v=>{rows[r-2][c-1]=v}})})};
vm.createContext(ctx);vm.runInContext(server,ctx,{filename:"coin-shopping-extension.gs"});
const result=ctx.moaruAdminCoinChangeGuarded_("u1",-5);
ok(result.success&&result.newCoin===-3&&rows[0][2]===-3,"admin negative coin adjustment did not preserve a negative balance");
console.log("ADMIN_BULK_COMMAND_OK");
