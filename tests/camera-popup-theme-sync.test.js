const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const html=read('camera-tool.html'),boot=read('js/tools/camera-tool.js');
ok(html.includes('<html lang="ko" data-theme="light">'),'camera popup must default to light before CSS');
ok(html.indexOf('window.opener')<html.indexOf('css/tokens.css?v='),'theme bootstrap must run before token CSS');
ok(html.includes('allowedThemes = new Set(["light", "dark", "forest"])'),'camera shell must support every app theme');
ok(html.includes('source?.dataset?.theme')&&html.includes('root.dataset.theme = theme'),'camera shell must copy opener theme before first paint');
ok(html.includes('source?.dataset?.motion')&&html.includes('--font-size'),'camera shell must copy motion/font presentation settings');
ok(html.includes('js/tools/camera-tool.js?v='),'camera bootstrap cache-bust must advance');
ok(boot.includes('watchOwnerPresentation(owner)'),'camera bootstrap must resync presentation after opening');
ok(boot.includes('new MutationObserver')&&boot.includes('attributeFilter: ["data-theme", "data-motion", "style"]'),'camera popup must follow live theme changes');
ok(boot.includes('themeObserver?.disconnect?.()'),'theme observer must be cleaned when popup closes');

// Execute the pre-CSS inline bootstrap against light/dark/forest opener states.
const match=html.match(/<script>\s*([\s\S]*?)<\/script>\s*<title>/);
ok(match,'pre-CSS theme bootstrap script missing');
for(const theme of ['light','dark','forest']){
  const attrs={}; const styles={}; const meta={content:''};
  const source={dataset:{theme,motion:'reduced'},style:{getPropertyValue:k=>k==='--font-size'?'18px':''}};
  const document={
    documentElement:{dataset:attrs,style:{setProperty:(k,v)=>styles[k]=v}},
    querySelector:q=>q==='meta[name="theme-color"]'?meta:null
  };
  const location={origin:'https://example.test'};
  const window={opener:{closed:false,location:{origin:'https://example.test'},document:{documentElement:source}}};
  const sandbox={window,document,location,Set};
  vm.createContext(sandbox); vm.runInContext(match[1],sandbox);
  ok(attrs.theme===theme,`pre-paint opener theme was not copied: ${theme}`);
  ok(attrs.motion==='reduced',`motion setting was not copied: ${theme}`);
  ok(styles['--font-size']==='18px',`font size was not copied: ${theme}`);
  const expected={light:'#f6f8fb',dark:'#0c121b',forest:'#0a1713'}[theme];
  ok(meta.content===expected,`theme-color was not synced: ${theme}`);
}
console.log('CAMERA_POPUP_THEME_SYNC_OK');
