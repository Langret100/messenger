const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','games','gugudan.html'),'utf8');
const games = fs.readFileSync(path.join(__dirname,'..','js','features','games.js'),'utf8');
const index = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL',msg); process.exit(1); } }
ok(html.includes('rawBottomOffsets'), 'irregular vertical offsets missing');
ok(html.includes('xJitterLimit'), 'horizontal jitter missing');
ok(html.includes('phaseOffsets'), 'staggered phase missing');
ok(html.includes('speedOffsets'), 'organic speed variation missing');
ok(!html.includes('speedRanks[index] * 180'), 'mechanical fixed speed ladder still present');
ok(html.includes('bottomSpread'), 'anti-row spread safeguard missing');
ok(!html.includes('ball.style.bottom = `${BALL_START_BOTTOM}px`'), 'all balls still share one start line');
ok(html.includes('const startBottom = BALL_START_BOTTOM + rawBottomOffsets[index]'), 'per-ball start bottom missing');
ok(html.includes('const newBottom = startBottom + maxRiseHeight * progress'), 'animation ignores per-ball start bottom');
ok(games.includes('games/gugudan.html?v=24'), 'gugudan cache bust not bumped');
ok(index.includes('js/features/games.js?v=21'), 'games loader cache bust not bumped');
console.log('GUGUDAN_NATURAL_FLOW_OK');
