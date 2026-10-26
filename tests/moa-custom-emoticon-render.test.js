const fs=require('fs'),vm=require('vm'),assert=require('assert');
function element(tag,attrs={},children=[]){const n={tag,attrs,children:[],ownerDocument:doc,className:attrs.class||'',append(...items){for(const item of items){if(item&&typeof item==='object')item.parent=this;this.children.push(item)}},replaceWith(replacement){const i=this.parent.children.indexOf(this);this.parent.children[i]=replacement},classList:{add(){}},dataset:{}};Object.assign(n,attrs);n.append(...children);return n;}
const doc={createElement:tag=>element(tag),createTextNode:text=>({tag:'#text',text})},persisted={};
const ctx={console,Date,URL,setTimeout:()=>1,clearTimeout(){},document:doc,MiniTalk:{Chat:{},Features:{},Registry:{register(){}},UI:{Dom:{el:element,doc:()=>doc}},Store:{get:()=>({user_id:'image-user'})},Persistence:{get:(_k,d)=>d,remove(){}},DataCache:{get:async(t,k,d)=>persisted[`${t}|${k}`]??d,put:async(t,k,v)=>persisted[`${t}|${k}`]=structuredClone(v)}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/chat/emoji.js','utf8'),ctx);
const chat=fs.readFileSync('js/features/moa-chat.js','utf8').replace('return{id:"moa-chat",','return{appendRichText,appendMessage,saveHistory,history,id:"moa-chat",');vm.runInContext(chat,ctx);
(async()=>{
 const feature=ctx.MiniTalk.Features.MoaChat,bubble=element('div');feature.appendRichText(bubble,'웃겼으면 성공 ㅋㅋ :e13: :e17: https://example.com');
 const images=bubble.children.filter(n=>n.tag==='img');assert.deepStrictEqual(images.map(n=>n.src),['assets/emoticons/e13.png','assets/emoticons/e17.png']);assert(images.every(n=>n.className==='chat-emoticon'));
 assert(bubble.children.some(n=>n.tag==='a'&&n.href==='https://example.com'),'link rendering regressed');
 images[0].onerror();assert(bubble.children.some(n=>n.tag==='#text'&&n.text==='웃음'),'missing-image fallback lost');
 const list=[];feature.appendMessage(list,'assistant','맞았어 ㅋㅋ :e17:',{source:'local-play'});await feature.saveHistory(list);const loaded=await feature.history();assert(loaded[0].text.endsWith(':e17:'),'image token not retained in chat persistence');
 console.log('MOA_CUSTOM_EMOTICON_RENDER_OK: existing images, link coexistence, missing-image fallback, persisted tokens');
})().catch(e=>{console.error(e);process.exitCode=1});
