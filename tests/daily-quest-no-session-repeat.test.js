const fs=require('fs'),assert=require('assert');
for(const file of ['js/tasks/daily-math-quest.js','js/tasks/daily-korean-quest.js']){
  const s=fs.readFileSync(file,'utf8');
  assert(/seenProblems\s*=\s*new Set\(\)/.test(s),`${file}: session must remember shown problems`);
  assert(/seenProblems\.add\(visibleProblemKey\(current\)\)/.test(s),`${file}: every displayed problem must enter seen set`);
  assert(/nextVariant\([^\n]*seenProblems/.test(s),`${file}: replacement selection must receive seen set`);
  assert(/!seenKeys\.has\(visibleProblemKey\(nextItem\)\)/.test(s),`${file}: replacement must reject all previously displayed questions`);
}
console.log('DAILY_QUEST_NO_SESSION_REPEAT_OK');
