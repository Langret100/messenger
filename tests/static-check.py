from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]

def local_refs(text):
    refs=re.findall(r'(?:src|href)="([^"]+)"',text)
    return [x for x in refs if not x.startswith(('http:','https:','#','data:','javascript:'))]

html=(root/'index.html').read_text(encoding='utf-8')
missing=[x for x in local_refs(html) if not (root/x.split('?',1)[0]).exists()]
if missing: raise SystemExit(f'HTML missing files: {missing}')

# 가져온 각 게임의 상대경로 의존성도 확인합니다.
for game in (root/'games').glob('*.html'):
    text=game.read_text(encoding='utf-8')
    for ref in local_refs(text):
        target=(game.parent/ref.split('?',1)[0]).resolve()
        if not target.exists(): raise SystemExit(f'Game missing dependency: {game.name} -> {ref}')

manifest=json.loads((root/'manifest.webmanifest').read_text(encoding='utf-8'))
for icon in manifest.get('icons',[]):
    if not (root/icon['src']).exists(): raise SystemExit(f"Missing icon: {icon['src']}")
sw=(root/'sw.js').read_text(encoding='utf-8')
core_match=re.search(r'const\s+CORE\s*=\s*\[(.*?)\];',sw,re.S)
if not core_match: raise SystemExit('Service worker CORE not found')
core=re.findall(r'"([^"]+)"',core_match.group(1))
missing_sw=[]
for item in core:
    rel=item[2:] if item.startswith('./') else item
    if rel and not (root/rel).exists(): missing_sw.append(item)
if missing_sw: raise SystemExit(f'SW missing files: {missing_sw}')
script_refs=re.findall(r'<script src="([^"]+)"',html)
scripts=[ref.split('?',1)[0] for ref in script_refs]
if len(scripts)!=len(set(scripts)): raise SystemExit('Duplicate script tags')
required=['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js','js/core/registry.js','js/core/router.js','js/game-bridge/game-host.js','js/features/games.js','js/app.js']
for f in required:
    if f not in scripts: raise SystemExit(f'Missing required script: {f}')
if scripts.index('js/app.js')!=len(scripts)-1: raise SystemExit('app.js must load last')
print('STATIC_CHECK_OK')
