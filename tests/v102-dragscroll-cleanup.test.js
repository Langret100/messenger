const fs=require('fs');
const vm=require('vm');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/ui/drag-scroll.js'),'utf8');
const tools=fs.readFileSync(path.join(root,'js/features/tools.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');

function classList(){
  const s=new Set();
  return {add:(...x)=>x.forEach(v=>s.add(v)),remove:(...x)=>x.forEach(v=>s.delete(v)),contains:v=>s.has(v)};
}
function makeDoc(){
  const listeners=new Map();
  const styles=new Map();
  const doc={
    head:{appendChild(node){styles.set(node.id,node)}},
    createElement(){return {id:'',textContent:''}},
    getElementById(id){return styles.get(id)||null},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
    count(type){return listeners.get(type)?.size||0},
    styleCount(){return styles.size}
  };
  return doc;
}
function makeScroller(doc){
  const listeners=new Map();
  return {
    ownerDocument:doc,classList:classList(),scrollHeight:1000,clientHeight:300,offsetWidth:300,clientWidth:290,scrollTop:0,
    getBoundingClientRect(){return {right:300}},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
    listenerCount(type){return listeners.get(type)?.size||0}
  };
}

const doc1=makeDoc();
const context={MiniTalk:{UI:{}},document:doc1,setTimeout:(fn)=>{fn();return 1},clearTimeout(){},console};
vm.runInNewContext(source,context,{filename:'drag-scroll.js'});
const DragScroll=context.MiniTalk.UI.DragScroll;
assert(DragScroll&&typeof DragScroll.bind==='function'&&typeof DragScroll.unbind==='function','bind/unbind API missing');

for(let i=0;i<50;i++){
  const scroller=makeScroller(doc1);
  DragScroll.bind(scroller,{documentMouseDrag:true,allowInteractive:'.modern-tool'});
  assert.strictEqual(doc1.count('mousemove'),1,`mousemove listener duplicated at iteration ${i}`);
  assert.strictEqual(doc1.count('mouseup'),1,`mouseup listener duplicated at iteration ${i}`);
  DragScroll.unbind(scroller);
  assert.strictEqual(doc1.count('mousemove'),0,`mousemove listener leaked at iteration ${i}`);
  assert.strictEqual(doc1.count('mouseup'),0,`mouseup listener leaked at iteration ${i}`);
  assert.strictEqual(scroller.listenerCount('mousedown'),0,`mousedown listener leaked at iteration ${i}`);
}
assert.strictEqual(doc1.styleCount(),1,'same document must receive one drag-scroll style only');

const doc2=makeDoc();
const scroller2=makeScroller(doc2);
DragScroll.bind(scroller2,{documentMouseDrag:true});
assert.strictEqual(doc2.styleCount(),1,'second/PiP document did not receive its own drag-scroll style');
DragScroll.unbind(scroller2);
assert.strictEqual(doc2.count('mousemove'),0,'PiP document mousemove listener leaked');
assert.strictEqual(doc2.count('mouseup'),0,'PiP document mouseup listener leaked');

assert(tools.includes('MiniTalk.UI.DragScroll?.unbind?.(activeDragList)'),'tools cleanup hook missing');
assert((tools.match(/MiniTalk\.UI\.DragScroll\?\.unbind\?\.\(activeDragList\)/g)||[]).length>=2,'tools must cleanup on rerender and leave');
assert(index.includes('js/ui/drag-scroll.js?v=10'),'drag-scroll cache-bust stale');
assert(index.includes('js/features/tools.js?v=64.5.4'),'tools cache-bust stale');
assert(sw.includes('moaru-v64.5.62-admin-fastpath-v104-20260821'),'service worker cache stale');
console.log('V102_DRAGSCROLL_CLEANUP_RUNTIME_OK');
