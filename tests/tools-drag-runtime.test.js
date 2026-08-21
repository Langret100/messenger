const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('js/ui/drag-scroll.js','utf8');
const listeners={},docListeners={};
const classes=new Set();
const classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x))};
const fakeHead={appendChild(){}};
const fakeDoc={head:fakeHead,createElement(){return{id:'',textContent:''}},addEventListener(type,fn){(docListeners[type]||(docListeners[type]=[])).push(fn)}};
const scroller={
  ownerDocument:fakeDoc,classList,scrollHeight:1000,clientHeight:400,offsetWidth:300,clientWidth:300,scrollTop:300,
  addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn)},
  getBoundingClientRect(){return{right:300}}
};
const button={matches(sel){return sel==='.modern-tool'},closest(sel){
  if(sel.includes('button'))return this;
  if(sel.includes('.modern-tool'))return this;
  return null;
}};
const context={MiniTalk:{UI:{}},document:fakeDoc,setTimeout};
vm.createContext(context);vm.runInContext(source,context);
context.MiniTalk.UI.DragScroll.bind(scroller,{allowInteractive:'.profile-summary,.modern-tool,.shortcut-row',documentMouseDrag:true});
function fireLocal(type,e){for(const fn of listeners[type]||[])fn(e)}
function fireDoc(type,e){for(const fn of docListeners[type]||[])fn(e)}
fireLocal('mousedown',{button:0,target:button,clientX:100,clientY:100});
let prevented=false;
fireDoc('mousemove',{clientX:101,clientY:150,preventDefault(){prevented=true}});
if(!prevented)throw new Error('tools document mouse drag did not prevent native action');
if(scroller.scrollTop!==250)throw new Error(`tools document mouse drag did not scroll: ${scroller.scrollTop}`);
fireDoc('mouseup',{});
let clickPrevented=false,stopped=false;
fireLocal('click',{preventDefault(){clickPrevented=true},stopPropagation(){stopped=true},stopImmediatePropagation(){}});
if(!clickPrevented||!stopped)throw new Error('tools document mouse drag did not suppress accidental click');
console.log('V101_TOOLS_DOCUMENT_MOUSE_DRAG_OK');
