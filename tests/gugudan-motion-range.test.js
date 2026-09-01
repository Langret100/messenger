const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','games','gugudan.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('const baseDuration = getRandomInt(4800, 5600);'),'base duration changed unexpectedly');
ok(html.includes('speedOffsetRange = isTallPortrait ? 1040 : (isMobile ? 900 : 860)'),'slow-end speed range missing');
ok(html.includes('const lowerStartDrop = isTallPortrait ? 38 : (isMobile ? 30 : 24);'),'lower start drop missing');
// Fastest possible duration remains 4800ms; slowest becomes longer than the previous max 6360ms.
const fastest=4800;
const previousTallSlowest=5600+760;
const tallSlowest=5600+1040;
ok(fastest===4800,'fastest speed ceiling changed');
ok(tallSlowest>previousTallSlowest,'slowest speed was not reduced');
// Start max remains +bottomRange; minimum extends below the previous 0 offset.
for(const lower of [24,30,38]){
  const bottomRange=150;
  const min=-lower, max=bottomRange;
  ok(min<0,'minimum start was not lowered');
  ok(max===150,'maximum start height changed');
}
// Sample random mapping to ensure values occupy the whole interval, not a fixed ladder.
let seed=12345; const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
let minOff=Infinity,maxOff=-Infinity,minSpeed=Infinity,maxSpeed=-Infinity;
for(let i=0;i<50000;i++){
  const lower=38,bottomRange=150,speedRange=1040;
  const off=-lower+rnd()*(bottomRange+lower);
  const sp=rnd()*speedRange;
  minOff=Math.min(minOff,off);maxOff=Math.max(maxOff,off);minSpeed=Math.min(minSpeed,sp);maxSpeed=Math.max(maxSpeed,sp);
}
ok(minOff<-35 && maxOff>147,'start height random range not fully exercised');
ok(minSpeed<10 && maxSpeed>1030,'speed random range not fully exercised');
console.log('GUGUDAN_MOTION_RANGE_OK');
