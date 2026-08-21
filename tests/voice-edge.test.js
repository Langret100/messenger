const fs=require('fs'),vm=require('vm'),assert=require('assert');
class FakeButton{constructor(){this.handlers={};this.classList={add(){},remove(){}}}addEventListener(t,f){(this.handlers[t]||(this.handlers[t]=[])).push(f)}fire(t,e={}){for(const f of this.handlers[t]||[])f({button:0,preventDefault(){},stopImmediatePropagation(){},...e})}}
class Rec{constructor(){Rec.last=this;this.results=[]}start(){this.onstart?.()}stop(){this.onend?.()}}
const ctx={console,window:null,setTimeout:(fn,ms)=>{if(ms===420)fn();return 1},clearTimeout(){},Promise,SpeechRecognition:Rec};ctx.window=ctx;ctx.window.SpeechRecognition=Rec;ctx.MiniTalk={Chat:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/chat/voice.js','utf8'),ctx);
(async()=>{
  const b=new FakeButton(),input={value:''},status={textContent:'',classList:{toggle(){}}};let sends=[];
  ctx.MiniTalk.Chat.Voice.bind(b,input,async text=>{sends.push(text)},status);
  b.fire('pointerdown');
  const rec=Rec.last;
  rec.onresult({resultIndex:0,results:Object.assign([[{transcript:'안녕'}]],{0:Object.assign([{transcript:'안녕'}],{isFinal:true}),length:1})});
  // Browser ends recognition before pointerup: must not send yet.
  rec.onend();assert.strictEqual(sends.length,0);
  b.fire('pointerup');await Promise.resolve();await Promise.resolve();
  assert.deepStrictEqual(sends,['안녕']);
  // Repeated end callback must not duplicate.
  rec.onend();await Promise.resolve();assert.deepStrictEqual(sends,['안녕']);
  console.log('VOICE_EDGE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
