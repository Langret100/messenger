const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.resolve(__dirname,"..");
class Range{constructor(sheet,row,col,rows=1,cols=1){Object.assign(this,{sheet,row,col,rows,cols})}getValues(){return Array.from({length:this.rows},(_,r)=>Array.from({length:this.cols},(_,c)=>this.sheet.rows[this.row-1+r]?.[this.col-1+c]??""))}getValue(){return this.getValues()[0][0]}setValue(value){while(this.sheet.rows.length<this.row)this.sheet.rows.push([]);this.sheet.rows[this.row-1][this.col-1]=value;return this}}
class Sheet{constructor(rows){this.rows=rows.map(row=>row.slice())}getLastRow(){return this.rows.length}getLastColumn(){return Math.max(0,...this.rows.map(row=>row.length))}getRange(row,col,rows=1,cols=1){return new Range(this,row,col,rows,cols)}appendRow(row){this.rows.push(row.slice());return this}deleteRow(row){this.rows.splice(row-1,1)}}
const login=new Sheet([["user_id","username","password","nickname","created_at","last_login"],["admin-user","admin","pw","관리자","",""]]);
const reward=new Sheet([["user_id","username","coin","url"],["admin-user","admin",100,"https://example.test/?user_id=admin-user"]]);
const sheets=new Map([["로그인",login],["보상",reward]]),props=new Map();
const workbook={getSheetByName:name=>sheets.get(name)||null};
const rewardData=id=>{const index=reward.rows.findIndex((row,i)=>i>0&&String(row[0])===String(id));return index<0?null:{rowIndex:index+1,coin:Number(reward.rows[index][2])||0}};
const ctx={console,REWARD_SHEET:"보상",COL_REWARD_USER_ID:1,MANUAL_WEB_APP_URL:"https://example.test/exec",SpreadsheetApp:{openById:()=>workbook},ContentService:{MimeType:{JSON:"json"},createTextOutput:value=>({value,setMimeType(){return this}})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},CacheService:{getScriptCache:()=>({get:key=>key==="shop-admin:token"?"admin-user":null,put(){},remove(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)||null,setProperty:(key,value)=>props.set(key,String(value)),deleteProperty:key=>props.delete(key),getProperties:()=>Object.fromEntries(props)})},Utilities:{getUuid:()=>"command-id",formatDate:(date)=>date.toISOString()},getRewardUserData_:rewardData,processCoinChangeUnlocked_:(id,action,amount)=>{const data=rewardData(id);if(!data)return{success:false};const before=Number(reward.rows[data.rowIndex-1][2])||0,next=action==="add"?before+amount:before-amount;if(next<0)throw new Error("잔액 부족!");reward.rows[data.rowIndex-1][2]=next;return{success:true,newCoin:next}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,"docs/apps-script/Code.gs"),"utf8"),ctx);vm.runInContext(fs.readFileSync(path.join(root,"docs/apps-script/coin-shopping-extension.gs"),"utf8"),ctx);
const parse=result=>JSON.parse(result.value);
const signed=parse(ctx.signup_({user_id:"U-new",username:"new-user",password:"pw",nickname:"새학생"}));
if(!signed.ok||signed.user_id!=="U-new"||signed.coin!==0||signed.coin_account_created!==true)throw new Error("signup did not report automatic coin account creation");
const account=reward.rows.find(row=>row[0]==="U-new");
if(!account||account[1]!=="new-user"||account[2]!==0||account[3]!=="https://example.test/exec?user_id=U-new")throw new Error("reward sheet account defaults or management URL are invalid");
if(login.rows.filter(row=>row[0]==="U-new").length!==1||reward.rows.filter(row=>row[0]==="U-new").length!==1)throw new Error("signup created duplicate account rows");
const duplicate=parse(ctx.signup_({user_id:"U-new-2",username:"new-user",password:"pw",nickname:"다른학생"}));
if(duplicate.ok||login.rows.some(row=>row[0]==="U-new-2")||reward.rows.some(row=>row[0]==="U-new-2"))throw new Error("duplicate signup left partial rows");
const balances=parse(ctx.handleAdminUserBalances({parameter:{user_id:"admin-user",admin_token:"token"}}));
if(balances.users.find(row=>row.user_id==="U-new")?.coin!==0)throw new Error("new account is not connected to admin balances");
const changed=parse(ctx.handleAdminCoinReward({parameter:{user_id:"admin-user",admin_token:"token",targets_json:'["U-new"]',amount:"5",reason:"가입 확인"}}));
if(!changed.ok||rewardData("U-new").coin!==5)throw new Error("new account cannot receive an administrator adjustment");
const deducted=parse(ctx.handleAdminCoinReward({parameter:{user_id:"admin-user",admin_token:"token",targets_json:'["U-new"]',amount:"-2",reason:"정정"}}));
if(!deducted.ok||rewardData("U-new").coin!==3)throw new Error("new account cannot receive a negative administrator adjustment");
reward.rows[0]=["unknown","username","coin","url"];
const beforeLoginCount=login.rows.length,beforeRewardCount=reward.rows.length,failed=parse(ctx.signup_({user_id:"U-bad",username:"bad-user",password:"pw",nickname:"실패학생"}));
if(failed.ok||failed.code!=="REWARD_SHEET_SCHEMA_UNSUPPORTED"||login.rows.length!==beforeLoginCount||reward.rows.length!==beforeRewardCount)throw new Error("coin schema failure did not roll back signup atomically");
console.log("SIGNUP_COIN_INIT_OK");
