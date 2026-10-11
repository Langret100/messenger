const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const pending=[],styles=[];
const root={dataset:{},style:{removeProperty(){},setProperty(){}}};
const document={documentElement:root,baseURI:'https://example.test/',head:{append(s){styles.push(s)}},getElementById(id){return id==='messenger-season-style'?styles[0]:null},querySelectorAll(){return []},createElement(){return {}},addEventListener(){}};
root.ownerDocument=document;
const ctx={console,URL,Intl,Date,Map,WeakMap,WeakSet,document,Image:class{set src(src){this.url=src;pending.push(this)}},MiniTalk:{Persistence:{get(){return {theme:'light'}}}}};ctx.window=ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/features/season-theme.js'),'utf8'),ctx);
assert.equal(root.dataset.seasonNavReady,undefined);
assert.equal(root.dataset.seasonUtilityReady,undefined);
assert.equal(pending.length,2);
assert(styles[0].textContent.includes('[data-season-nav-ready] .nav-button'));
assert(styles[0].textContent.includes('[data-season-utility-ready] :is(.tool-glyph'));
assert(styles[0].textContent.includes('background-size:700% 800%'));
pending.forEach(image=>image.onload());
setImmediate(()=>{
 assert.equal(root.dataset.seasonNavReady,'true');
 assert.equal(root.dataset.seasonUtilityReady,'true');
 console.log('SEASON_CONTROL_LOADING_OK');
});
