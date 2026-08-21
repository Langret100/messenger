const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('js/ui/drag-scroll.js','utf8');
const listeners={};
const classes=new Set();
const classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x))};
const fakeHead={appendChild(){}};
const fakeDoc={head:fakeHead,createElement(){return{id:'',textContent:''}}};
const scroller={
  ownerDocument:fakeDoc,classList,scrollHeight:1000,clientHeight:400,offsetWidth:300,clientWidth:300,scrollTop:300,
  addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn)},
  setPointerCapture(){this.captured=true},releasePointerCapture(){this.captured=false},hasPointerCapture(){return !!this.captured},
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
fire('pointerdown',{pointerType:'mouse',button:0,target:button,pointerId:1,clientX:100,clientY:100});
if(!scroller.captured)throw new Error('interactive tool button did not start pointer capture');
let prevented=false;
fire('pointermove',{pointerId:1,clientX:101,clientY:150,preventDefault(){prevented=true}});
if(!prevented)throw new Error('vertical interactive drag did not prevent native action');
if(scroller.scrollTop!==250)throw new Error(`tools drag did not scroll: ${scroller.scrollTop}`);
fire('pointerup',{pointerId:1});
let clickPrevented=false,stopped=false;
fire('click',{preventDefault(){clickPrevented=true},stopPropagation(){stopped=true},stopImmediatePropagation(){}});
if(!clickPrevented||!stopped)throw new Error('drag gesture did not suppress accidental tool click');
console.log('V98_TOOLS_DRAG_RUNTIME_OK');
