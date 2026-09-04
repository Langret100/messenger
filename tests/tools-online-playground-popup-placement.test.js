const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/features/tools.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(src.includes('{ id: "playground", icon: "↗", title: "온라인 놀이터", description: "친구와 온라인으로 놀기" }'),'playground tool card/description missing');
ok(src.includes('playground: () => openOnlinePlayground()'),'playground action must use positioned opener');
ok(src.includes('function externalGamePopupBounds(sourceView)'),'positioned playground bounds missing');
ok(src.includes('gap = 42'),'playground must preserve 42px messenger gap');
ok(src.includes('rightStart = Math.min(availLeft + availWidth, messengerLeft + messengerW + gap)'),'right-side non-overlap calculation missing');
ok(src.includes('bottomStart = Math.min(availTop + availHeight, messengerTop + messengerH + gap)'),'vertical fallback non-overlap calculation missing');
ok(src.includes('window.open("", "MoaruOnlinePlayground", features)'),'desktop playground must use named positioned popup');
ok(src.includes('popup.resizeTo(bounds.width, bounds.height); popup.moveTo(bounds.left, bounds.top)'),'popup bounds enforcement missing');
ok(!src.includes('title: "온라인 놀이터", description: "친구와 온라인으로 놀기", url:'),'playground must not remain a plain target=_blank card');
ok(html.includes('js/features/tools.js?v='),'tools cache-bust stale');
console.log('TOOLS_ONLINE_PLAYGROUND_POPUP_PLACEMENT_OK');
