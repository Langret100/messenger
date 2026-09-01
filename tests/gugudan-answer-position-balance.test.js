const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','games/gugudan.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('const correctSlotUsage = new Map();'),'per-count correct slot usage missing');
ok(html.includes('function nextCorrectSlot(count)'),'balanced correct-slot selector missing');
ok(html.includes('let usage = correctSlotUsage.get(count);'),'selector must preserve usage by answer count');
ok(html.includes('.filter(index => index !== lastCorrectSlot)'),'selector must exclude previous correct slot');
ok(html.includes('const minUsage = Math.min'),'selector must prefer least-used slots');
ok(html.includes('const correctSlot = nextCorrectSlot(answers.length);'),'correct answer must use balanced slot');
ok(html.includes('const slot = answerSlots[index];'),'ball placement must start from assigned answer slot');
ok(html.includes('ball.style.left = `${positions[slot]}px`'),'visual position must stay anchored to assigned balanced slot');

function makePicker(r=Math.random){const usageMap=new Map();let last=-1;return function next(n){if(n<=1){last=0;return 0}let usage=usageMap.get(n);if(!usage||usage.length!==n){usage=Array(n).fill(0);usageMap.set(n,usage)}const candidates=Array.from({length:n},(_,i)=>i).filter(i=>i!==last);const min=Math.min(...candidates.map(i=>usage[i]));const least=candidates.filter(i=>usage[i]===min);const slot=least[Math.floor(r()*least.length)];usage[slot]++;last=slot;return slot}}

for(const n of [4,5]){
  const next=makePicker(); const seen=Array(n).fill(0); let prev=-1;
  for(let i=0;i<50000;i++){
    const slot=next(n); ok(slot!==prev,`consecutive correct slot repeated for ${n} balls at ${i}`); prev=slot; seen[slot]++;
  }
  const min=Math.min(...seen), max=Math.max(...seen);
  ok(max-min<=1,`correct slots not balanced for ${n} balls: ${seen}`);
}

const next=makePicker(()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32});
const seen4=Array(4).fill(0), seen5=Array(5).fill(0); let prev=-1, seed=0x12345678;
for(let i=0;i<100000;i++){
  const r=(seed=(seed*1664525+1013904223)>>>0)/2**32;
  const n=r<0.5?4:5; const slot=next(n);
  ok(slot!==prev,`mixed 4/5 sequence repeated slot at ${i}`); prev=slot;
  (n===4?seen4:seen5)[slot]++;
}
for(const [n,seen] of [[4,seen4],[5,seen5]]){
  const min=Math.min(...seen), max=Math.max(...seen);
  ok(max-min<=1,`mixed runtime distribution not balanced for ${n} balls: ${seen}`);
}
console.log('GUGUDAN_ANSWER_POSITION_BALANCE_OK', JSON.stringify({seen4,seen5}));
