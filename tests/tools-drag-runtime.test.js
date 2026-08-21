const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('js/ui/drag-scroll.js','utf8');
const listeners={};
const classes=new Set();
const classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x))};
const fakeHead={appendChild(){}};
const fakeDoc={head:fakeHead,createElement(){return{id:'',textContent:''}},getElementById(){return null}};
const scroller={
  ownerDocument:fakeDoc,classList,scrollHeight:1000,clientHeight:400,offsetWidth:300,clientWidth:300,scrollTop:300,
  addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn)},
  setPointerCapture(){},hasPointerCapture(){return false},releasePointerCapture(){},
  getBoundingClientRect(){return{right:300}}
};
const button={matches(sel){return sel==='.modern-tool'},closest(sel){
  if(sel.includes('button'))return this;
  if(sel.includes('.modern-tool'))return this;
  return null;
}};
const context={MiniTalk:{UI:{}},document:fakeDoc,setTimeout};
vm.createContext(context);vm.runInContext(source,context);
context.MiniTalk.UI.DragScroll.bind(scroller,{allowInteractive:'.profile-summary,.modern-tool,.shortcut-row'});
function fire(type,e){for(const fn of listeners[type]||[])fn(e)}
fire('pointerdown',{pointerType:'mouse',button:0,pointerId:7,target:button,clientX:100,clientY:100});
let prevented=false;
fire('pointermove',{pointerType:'mouse',pointerId:7,target:button,clientX:101,clientY:150,preventDefault(){prevented=true}});
if(!prevented)throw new Error('tools shared pointer drag did not prevent native action');
if(scroller.scrollTop!==250)throw new Error(`tools shared pointer drag did not scroll: ${scroller.scrollTop}`);
fire('pointerup',{pointerId:7});
let clickPrevented=false,stopped=false;
fire('click',{preventDefault(){clickPrevented=true},stopPropagation(){stopped=true},stopImmediatePropagation(){}});
if(!clickPrevented||!stopped)throw new Error('tools shared pointer drag did not suppress accidental click');
console.log('TOOLS_SHARED_POINTER_DRAG_OK');
