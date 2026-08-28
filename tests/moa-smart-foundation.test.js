const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const engine=read('js/ai/moa-communication-engine.js'),gs=read('docs/apps-script/MOA_AI.gs'),html=read('index.html'),chat=read('js/features/moa-chat.js');
ok(html.includes('moa-communication-engine.js?v=48'),'smart foundation engine cache bust missing');
ok(!chat.includes('moa-suggestion-row')&&!chat.includes('moa-suggestion-chip'),'removed quick buttons returned');
for(const token of ['knowledgeCue','previousSearchAnchor','뭘 찾아볼까? 궁금한 대상이나 주제를 말해줘.','frame.knowledgeCue&&frame.question'])ok(engine.includes(token),'smart client foundation missing '+token);
for(const token of ['moaSynthesizeSearch_','moaSentenceScore_','참고한 공개 자료','moa.search.v4.'])ok(gs.includes(token),'answer-first search backend missing '+token);
const general=gs.slice(gs.indexOf('function moaGeneralSearch_'),gs.indexOf('function moaSearchAssist_'));
ok(!general.includes('더 찾아보기')&&!general.includes('직접 더 찾아보기'),'general search still falls back to link dumping');

const store={},searches=[];const fakeMath=Object.create(Math);fakeMath.random=()=>0;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u-smart',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{
  moaSync:async()=>({ok:true,version:1,patterns:[],policy:{},profile:{},memories:{}}),
  moaSearch:async({query})=>{searches.push(query);return {reply:'ANSWER:'+query,source:'web-answer',kind:'answer'}},
  moaCommit:async()=>({ok:true,version:2})
}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
  let r=await e.reply('광합성이 뭐야?');ok(r.reply==='ANSWER:광합성','fact question did not become answer-first search: '+r.reply);ok(searches.at(-1)==='광합성','fact query extraction wrong');
  e.clearContext();searches.length=0;r=await e.reply('찾아줘');ok(/뭘 찾아볼까/.test(r.reply)&&searches.length===0,'empty find command should clarify, not search junk');
  e.clearContext();searches.length=0;await e.reply('세종대왕 궁금해');r=await e.reply('찾아줘');ok(r.reply==='ANSWER:세종대왕','bare follow-up find did not reuse prior user topic: '+r.reply);ok(searches.at(-1)==='세종대왕','follow-up search anchor wrong: '+searches.at(-1));
  e.clearContext();searches.length=0;r=await e.reply('안녕');ok(r.source==='local'&&searches.length===0,'small talk incorrectly searched');
  console.log('MOA_SMART_FOUNDATION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
