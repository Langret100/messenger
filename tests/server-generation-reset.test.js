const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),code=fs.readFileSync(path.join(root,'js/adapters/server-generation.js'),'utf8'),KEY='miniTalk.v3.serverGeneration';
function storage(values={}){const data=new Map(Object.entries(values));return{get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
function backend(generation=null,{empty=true,fail=false,invalid=false,conflict=false}={}){const calls=[];return{calls,get generation(){return generation},fetch:async(url,opts)=>{
  calls.push({url,...opts});if(fail)throw Error('network unavailable');const marker=url.includes('/deviceGeneration.json');
  if(opts.method==='PUT'){if(conflict){generation='race-winner';return{status:412,ok:false}}assert.equal(opts.headers['if-match'],'"etag"');generation=JSON.parse(opts.body)}
  return{ok:!invalid,status:invalid?403:200,headers:{get:()=> '"etag"'},json:async()=>marker?generation:empty?null:{global:true}};
}}}
function fixture(server,values={},clearFails=false){const events={},localStorage=storage(values),sessionStorage=storage({'miniTalk.v3.session':'old','other':'keep'});let cleared=0,reloads=0;
  const context={MiniTalk:{DataCache:{clearAll:async()=>{if(clearFails)throw Error('disk failure');cleared++}},Realtime:{cleanup(){}}},MiniTalkConfig:{firebase:{databaseURL:'https://fixture.test',apiKey:'test'}},localStorage,sessionStorage,fetch:server.fetch,AbortController,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'new-generation'},location:{reload:()=>reloads++},console:{warn(){}},addEventListener:(t,f)=>events[t]=f};vm.runInNewContext(code,context);return{module:context.MiniTalk.ServerGeneration,localStorage,sessionStorage,events,get cleared(){return cleared},get reloads(){return reloads}}}
const old={ [KEY]:'old-generation','miniTalk.v3.session.user':'old login','miniTalk.v3.quests':'old progress','chat.roomGames.rsa.u':'key','admin.pendingCoinRequests.v1':'pending',other:'keep'};
(async()=>{
  const changed=fixture(backend('new-generation'),old);assert.equal(await changed.module.check(),true);assert.equal(changed.cleared,1);assert.equal(changed.reloads,1);assert.equal(changed.localStorage.length,2);assert.equal(changed.localStorage.getItem('other'),'keep');assert.equal(changed.sessionStorage.length,1);assert.equal(changed.localStorage.getItem(KEY),'new-generation');
  const healthyServer=backend('old-generation'),healthy=fixture(healthyServer,old);assert.equal(await healthy.module.check(),false);await healthy.module.check();assert.equal(healthyServer.calls.length,1);assert.equal(healthy.cleared,0);assert(healthy.localStorage.getItem('miniTalk.v3.session.user'));
  const missing=fixture(backend(null),old);assert.equal(await missing.module.check(),true);assert.equal(missing.localStorage.getItem(KEY),'new-generation');
  const established=fixture(backend(null,{empty:false}),{'miniTalk.v3.session.user':'old login'});assert.equal(await established.module.check(),false);assert(established.localStorage.getItem('miniTalk.v3.session.user'),'first deployment must preserve a populated server');
  const firstReset=fixture(backend(null),{'miniTalk.v3.session.user':'old login'});assert.equal(await firstReset.module.check(),true);assert.equal(firstReset.localStorage.getItem('miniTalk.v3.session.user'),null);
  const delayed=fixture(backend('new-generation',{empty:false}),old);assert.equal(await delayed.module.check(),true,'later devices must clear even after new users/products exist');
  for(const options of [{fail:true},{invalid:true}]){const f=fixture(backend(null,options),old);assert.equal(await f.module.check(),false);assert.equal(f.cleared,0);assert.equal(f.localStorage.getItem(KEY),'old-generation');assert.equal(f.reloads,0)}
  const broken=fixture(backend('new-generation'),old,true);assert.equal(await broken.module.check(),false);assert.equal(broken.localStorage.getItem(KEY),'old-generation');assert.equal(broken.reloads,0);
  const race=fixture(backend(null,{conflict:true}),old);assert.equal(await race.module.check(),true);assert.equal(race.localStorage.getItem(KEY),'race-winner');
  const tab=fixture(backend('old-generation'),old);await tab.module.check();tab.events.storage({key:KEY,newValue:'new-generation'});assert.equal(tab.reloads,1);assert.equal(tab.sessionStorage.getItem('miniTalk.v3.session'),null);
  const restart=fixture(backend('new-generation'),{[KEY]:'new-generation'});assert.equal(await restart.module.check(),false);assert.equal(restart.reloads,0,'clearing must not cause a reload loop');
  const rules=JSON.parse(fs.readFileSync(path.join(root,'database.rules.json'),'utf8')).rules;assert.equal(rules.moaru.v3.economyRuntime['.read'],true);assert.equal(rules.moaru.v3.economyRuntime['.write'],true);
  assert(fs.readFileSync(path.join(root,'js/app.js'),'utf8').indexOf('ServerGeneration?.check')<fs.readFileSync(path.join(root,'js/app.js'),'utf8').indexOf('Auth.restore'));
  console.log('SERVER_GENERATION_RESET_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
