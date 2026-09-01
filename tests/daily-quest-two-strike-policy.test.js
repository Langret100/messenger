const fs=require('fs'),path=require('path');
for(const name of ['daily-math-quest.js','daily-korean-quest.js']){
  const code=fs.readFileSync(path.join(__dirname,'..','js/tasks',name),'utf8');
  const ok=(v,m)=>{if(!v)throw new Error(`${name}: ${m}`)};
  ok(/wrongCount\s*=\s*0/.test(code),'wrong count must live only inside each opened mission');
  ok(/wrongCount\s*\+=\s*1/.test(code),'wrong count increment missing');
  ok(/wrongCount\s*>=\s*2/.test(code),'two-wrong reset threshold missing');
  ok(/progress\.correct\[missionId\]\s*=\s*0/.test(code),'two wrong answers must reset only current mission progress');
  ok(/progress\.completed\[missionId\]\s*=\s*false/.test(code),'current mission completion must reset');
  ok(/saveProgress\(progress,\s*\{\s*replaceCloud:\s*true\s*\}\)/.test(code),'normal quest progress reset must replace stale cloud progress');
  ok(!/strikes\s*:|progress\.strikes|saved\.strikes/.test(code),'wrong count must not be persisted');
  ok(/if\s*\(answerLocked\)\s*return|if\(answerLocked\)return/.test(code),'rapid multi-click guard missing');
  ok(/nextVariant\(/.test(code),'wrong answer must switch to a new problem variant');
}
console.log('DAILY_QUEST_TWO_STRIKE_POLICY_OK');
