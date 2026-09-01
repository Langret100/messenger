const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','games/gugudan.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('const positions = Array.from({ length: answers.length }'),'gugudan must use computed non-overlap slots');
ok(!html.includes('attempts < 100'),'gugudan must not fall back to overlapping random placement');
ok(html.includes('const speedOffsets = answers.map'),'gugudan balls need organic speed offsets');
ok(html.includes('Math.abs(v - speedOffsets[i]) < 45'),'near-identical speeds must be separated');
ok(html.includes('baseDuration + speedOffsets[index]'),'gugudan ball durations must use per-ball speed offsets');
for(const width of [200,240,280,320,360,500,760,1200])for(const count of [4,5]){
  const sidePadding=6,preferredGap=10,cssBallSize=width<=600?72:84;
  const maxFittingSize=Math.floor((Math.max(200,width)-sidePadding*2-preferredGap*(count-1))/count);
  const size=Math.max(36,Math.min(cssBallSize,maxFittingSize));
  const gap=count>1?Math.max(2,(Math.max(200,width)-sidePadding*2-size*count)/(count-1)):0;
  const pos=Array.from({length:count},(_,i)=>sidePadding+i*(size+gap));
  const jitter=Math.max(0,Math.min(14,gap*0.32));
  for(let i=1;i<pos.length;i++){
    const worstLeft=pos[i]-jitter;
    const worstPrevRight=pos[i-1]+jitter+size;
    ok(worstLeft>=worstPrevRight-0.01,`jittered balls can overlap at width=${width}, count=${count}`);
  }
  ok(pos[count-1]+size<=Math.max(200,width)-sidePadding+0.01,`balls escape container at width=${width}, count=${count}`);
}
console.log('GUGUDAN_BALL_SEPARATION_OK');
