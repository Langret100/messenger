const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','games/gugudan.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('function buildNaturalPositions(count)'),'gugudan must build natural horizontal positions');
ok(html.includes('const minGap = answers.length > 1'),'gugudan needs a minimum non-overlap gap');
ok(!html.includes('xJitterLimit'),'tiny fixed x jitter should not be the horizontal layout strategy');
ok(!html.includes('attempts < 100'),'gugudan must not fall back to overlapping random placement');
ok(html.includes('const speedOffsets = answers.map'),'gugudan balls need organic speed offsets');
ok(html.includes('Math.abs(v - speedOffsets[i]) < 55'),'near-identical speeds must be separated');
ok(html.includes('baseDuration + speedOffsets[index]'),'gugudan ball durations must use per-ball speed offsets');

function makePositions(width,count,height,r=Math.random){
  const containerWidth=Math.max(200,width),containerHeight=height||Math.max(540,width*1.4);
  const isMobile=width<=600, isTallPortrait=containerHeight>containerWidth*1.2;
  const sidePadding=isMobile?4:6, preferredGap=isTallPortrait?3:5;
  const cssBallSize=isMobile?(containerWidth<=360?66:70):84;
  const maxFittingSize=Math.floor((containerWidth-sidePadding*2-preferredGap*(count-1))/count);
  const size=Math.max(isMobile?34:36,Math.min(cssBallSize,maxFittingSize));
  const availableGap=count>1?(containerWidth-sidePadding*2-size*count)/(count-1):0;
  const minGap=count>1?Math.max(0,Math.min(preferredGap,availableGap)):0;
  const baseUsed=sidePadding*2+size*count+minGap*(count-1), extra=Math.max(0,containerWidth-baseUsed);
  const segmentCount=count+1;
  let weights=[];
  for(let attempt=0;attempt<20;attempt++){
    weights=Array.from({length:segmentCount},(_,index)=>{
      const isEdge=index===0||index===segmentCount-1;
      let weight=isEdge?(isTallPortrait?0.08+r()*0.50:0.05+r()*0.45):(isTallPortrait?0.10+r()*1.55:0.10+r()*2.10);
      if(!isEdge&&r()<0.45) weight*=0.10+r()*0.40;
      if(!isEdge&&r()<0.25) weight*=1.60+r()*1.80;
      if(isEdge&&r()<0.45) weight*=0.25+r()*0.55;
      return weight;
    });
    const interior=weights.slice(1,-1);
    if(interior.length<=1) break;
    const spread=Math.max(...interior)-Math.min(...interior);
    if(spread>=0.55) break;
  }
  const sum=weights.reduce((a,b)=>a+b,0)||1, distributed=weights.map(w=>extra*w/sum), pos=[sidePadding+distributed[0]];
  for(let i=1;i<count;i++) pos[i]=pos[i-1]+size+minGap+distributed[i];
  const gaps=[]; for(let i=1;i<count;i++) gaps.push(pos[i]-pos[i-1]-size);
  return {pos,size,gaps,minGap};
}
let seed=0x31415926;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
for(const [width,height] of [[200,520],[240,700],[280,860],[320,980],[360,1100],[500,1000],[760,820],[1200,760],[1258,760]])for(const count of [4,5]){
  for(let round=0;round<3000;round++){
    const {pos,size,gaps,minGap}=makePositions(width,count,height,rand);
    for(let i=1;i<pos.length;i++) ok(pos[i]>=pos[i-1]+size+minGap-0.01,`balls overlap width=${width} height=${height} count=${count}`);
    ok(pos[0]>=(width<=600?3.99:5.99),`left edge escape width=${width} count=${count}`);
    ok(pos[count-1]+size<=Math.max(200,width)-(width<=600?3.99:5.99),`right edge escape width=${width} count=${count}`);
    const spread=Math.max(...gaps)-Math.min(...gaps);
    if(width>=760&&count>=4) ok(spread>=18,`wide layout still looks mechanically even width=${width} count=${count}: ${gaps}`);
  }
}
console.log('GUGUDAN_BALL_SEPARATION_OK');
