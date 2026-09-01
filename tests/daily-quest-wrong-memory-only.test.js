const fs=require('fs'),assert=require('assert');
for(const file of ['js/tasks/daily-math-quest.js','js/tasks/daily-korean-quest.js']){
 const s=fs.readFileSync(file,'utf8');
 const open=s.slice(s.indexOf('function openMission'));
 assert(/wrongCount\s*=\s*0/.test(open),`${file}: wrong count must be per-open memory`);
 assert(!/progress\.attempts\[missionId\]\s*=/.test(open),`${file}: wrong answers must not be persisted as attempts`);
 assert(/let variant\s*=\s*0/.test(open),`${file}: retry variant must reset when modal reopens`);
 const firstWrong=open.slice(open.indexOf('if (answer !== current.answer)'),open.indexOf('selected.classList.add("correct")'));
 const marker=firstWrong.search(/if\s*\(\s*wrongCount\s*>=\s*2\s*\)/);
 assert(marker>=0,`${file}: missing two-strike branch`);
 const beforeSecond=firstWrong.slice(0,marker);
 assert(!/saveProgress\(/.test(beforeSecond),`${file}: first wrong must not save progress`);
 assert(/saveProgress\(progress,\s*\{\s*replaceCloud:\s*true\s*\}\)/.test(firstWrong),`${file}: two-strike reset must persist only mission progress reset`);
}
console.log('DAILY_QUEST_WRONG_MEMORY_ONLY_OK');
