const fs=require('fs'),path=require('path');
for(const name of ['daily-math-quest.js','daily-korean-quest.js']){
  const code=fs.readFileSync(path.join(__dirname,'..','js','tasks',name),'utf8');
  const ok=(v,m)=>{if(!v)throw new Error(`${name}: ${m}`)};
  ok(/sessionCorrect\s*=\s*0/.test(code),'each opened mission must start session progress at zero');
  ok(/const index = sessionCorrect|const index=sessionCorrect/.test(code),'question index must use per-open session progress');
  ok(/progress\.correct\[.*?\]\s*=\s*progress\.completed.*?QUESTIONS_PER_MISSION\s*:\s*0|progress\.correct\[item\.id\]\s*=\s*progress\.completed\[item\.id\]\s*\?\s*QUESTIONS_PER_MISSION\s*:\s*0/.test(code),'stored incomplete progress must normalize to 0/5');
  const correctStart=code.indexOf('selected.classList.add("correct")');
  const completedCheck=code.indexOf('if (progress.completed',correctStart);
  const correctBlock=code.slice(correctStart,completedCheck>correctStart?completedCheck:correctStart+900);
  ok(/sessionCorrect\s*=\s*index\s*\+\s*1/.test(correctBlock),'correct answer must advance only the open-session counter');
  ok(/if\s*\(sessionCorrect\s*>=\s*QUESTIONS_PER_MISSION\)/.test(correctBlock),'mission completion must be the persistence boundary');
  ok(/if\s*\(sessionCorrect\s*>=\s*QUESTIONS_PER_MISSION\)\s*\{[\s\S]*?saveProgress\(progress\)/.test(correctBlock),'progress may persist only inside the completion branch');
  const afterCompletionBranch=correctBlock.replace(/if\s*\(sessionCorrect\s*>=\s*QUESTIONS_PER_MISSION\)\s*\{[\s\S]*?saveProgress\(progress\)\s*;?\s*\}/,'');
  ok(!/saveProgress\(progress\)/.test(afterCompletionBranch),'partial correct answers must not be persisted');
}
console.log('DAILY_QUEST_SESSION_PROGRESS_RESET_OK');
