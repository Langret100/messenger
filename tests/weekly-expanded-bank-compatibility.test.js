const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../js/tasks/friday-grade6-mission.js'),'utf8');
function load(iso){const Real=Date;class D extends Real{constructor(...a){super(...(a.length?a:[iso]))}static now(){return new Real(iso).getTime()}}const c={Date:D,console,setTimeout,clearTimeout,setInterval,clearInterval,MiniTalk:{Tasks:{},Store:{get:()=>({user_id:'compat-user'})},Realtime:{},UI:{},Economy:{}}};vm.createContext(c);vm.runInContext(source,c);return c.MiniTalk.Tasks.FridayGrade6Mission;}
for(const row of [{"iso":"2026-10-09T12:00:00","version":"v4","hash":"4e0b900d9fc562d1136908d5bb39ba6d97a8ffd3bdd26a940a8e58e4c38ae947"},{"iso":"2026-10-09T12:00:00","version":"v5","hash":"4dd30900f28df2adccf0e62ffa300851d26f9648345e12d4390e044d40420dfc"},{"iso":"2026-10-09T12:00:00","version":"v6","hash":"f1f0f2bf2650f8f0d2d26a8ae831d242f93fea33f4b2d5dd96da5112e9dfc627"},{"iso":"2026-10-09T12:00:00","version":"v7","hash":"332fd240dda56ff615050c81a7fcd06b205dd45b5faf71af38eb6d62008b8cd9"},{"iso":"2026-10-09T12:00:00","version":"v8","hash":"ce8519f88f25552c94bbdb2713d97ee67b2ce1fbb99cb96014cc43c60426ebbf"},{"iso":"2026-10-16T12:00:00","version":"v4","hash":"375709e77fff0299bab16d1db14eadf22114d582e119b4723c4bb4d6583c3a9c"},{"iso":"2026-10-16T12:00:00","version":"v5","hash":"ba7e7acd2b0699122176edc23525d0ebbe01066c35495742fcb82acb632e9c3a"},{"iso":"2026-10-16T12:00:00","version":"v6","hash":"fa59ff8735704bab66d6f4163d0c425f1de42f7b79c2cc69a6650e00d8a7da21"},{"iso":"2026-10-16T12:00:00","version":"v7","hash":"d6d20da5a6f9f080394fa6310fbca1a2fc8dcca2b98742639ff0294f23f682bc"},{"iso":"2026-10-16T12:00:00","version":"v8","hash":"d6d20da5a6f9f080394fa6310fbca1a2fc8dcca2b98742639ff0294f23f682bc"}]){const actual=load(row.iso).makeQuestions(row.version);assert.equal(crypto.createHash('sha256').update(JSON.stringify(actual)).digest('hex'),row.hash,'legacy draft questions changed: '+row.version);}
const used={수학:new Set(),국어:new Set()},last={};
for(let week=0;week<20;week++){
 const date=new Date(Date.UTC(2026,7,21+week*7,12)),q=load(date.toISOString()).makeQuestions(),subject=q[0].subject,keys=q.map(x=>x.text);
 assert.equal(q.length,20);assert.equal(new Set(keys).size,20);
 for(const x of q){assert.equal(new Set(x.choices).size,4);assert(x.choices.includes(x.answer));assert.equal(x.subject,subject);}
 if(last[subject])assert(!keys.some(k=>last[subject].has(k)),'consecutive same-subject weeks repeated');
 last[subject]=new Set(keys);for(const k of keys)used[subject].add(k);
}
assert(used.국어.size>=129,'expanded Korean bank should provide at least 129 distinct questions across ten missions');
assert(used.수학.size>=150,'expanded math bank should provide at least 129 distinct questions across ten missions');
console.log('WEEKLY_EXPANDED_BANK_COMPATIBILITY_OK');

