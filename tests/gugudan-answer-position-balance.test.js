const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','games/gugudan.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('let correctSlotBag = [];'),'correct slot bag missing');
ok(html.includes('function nextCorrectSlot(count)'),'balanced correct-slot selector missing');
ok(html.includes('correctSlotBag = shuffleArray(Array.from({ length: count }'),'slot bag must be shuffled');
ok(html.includes('if (correctSlotBag[0] === lastCorrectSlot)'),'cycle boundary repeat guard missing');
ok(html.includes('const correctSlot = nextCorrectSlot(answers.length);'),'correct answer must use balanced slot');
ok(html.includes('ball.style.left = `${positions[answerSlots[index]]}px`'),'ball placement must use assigned answer slot');

function shuffle(a,r=Math.random){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function makePicker(r=Math.random){let bag=[], count=0, last=-1;return function next(n){if(n<=1){last=0;return 0}if(count!==n||bag.length===0){count=n;bag=shuffle(Array.from({length:n},(_,i)=>i),r);if(bag[0]===last){const si=bag.findIndex(x=>x!==last);if(si>0)[bag[0],bag[si]]=[bag[si],bag[0]]}}const slot=bag.shift();last=slot;return slot}}
for(const n of [4,5]){
  const next=makePicker(); const seen=Array(n).fill(0); let prev=-1;
  for(let i=0;i<50000;i++){
    const slot=next(n); ok(slot!==prev,`consecutive correct slot repeated for ${n} balls at ${i}`); prev=slot; seen[slot]++;
  }
  const min=Math.min(...seen), max=Math.max(...seen);
  ok(max-min<=1,`correct slots not balanced for ${n} balls: ${seen}`);
  for(const c of seen) ok(c>0,`unused correct slot for ${n} balls`);
}
console.log('GUGUDAN_ANSWER_POSITION_BALANCE_OK');
