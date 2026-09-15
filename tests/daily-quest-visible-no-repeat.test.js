const fs=require('fs');
function ok(v,m){if(!v)throw new Error(m)}
const math=fs.readFileSync('js/tasks/daily-math-quest.js','utf8');
const kor=fs.readFileSync('js/tasks/daily-korean-quest.js','utf8');
ok(math.includes('function visibleProblemKey(item)'), 'math visible problem key missing');
ok(math.includes('seenProblems.add(visibleProblemKey(current))'), 'math session repeat guard must use visible prompt');
ok(math.includes('!seenKeys.has(visibleProblemKey(nextItem))'), 'math replacement must reject previously shown visible prompt');
ok(kor.includes('function visibleProblemKey(item)'), 'korean visible problem key missing');
ok(kor.includes('seenProblems.add(visibleProblemKey(current))'), 'korean session repeat guard must use visible prompt');
ok(kor.includes('!seenKeys.has(visibleProblemKey(nextItem))'), 'korean replacement must reject previously shown visible prompt');
console.log('DAILY_QUEST_VISIBLE_NO_REPEAT_OK');
