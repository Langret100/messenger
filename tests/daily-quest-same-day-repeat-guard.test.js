const fs=require('fs'),assert=require('assert');
for(const file of ['js/tasks/daily-math-quest.js','js/tasks/daily-korean-quest.js']){
  const s=fs.readFileSync(file,'utf8');
  assert(/SEEN_STORAGE_KEY/.test(s),`${file}: same-day shown-question ledger missing`);
  assert(/function loadDailySeen/.test(s)&&/function saveDailySeen/.test(s),`${file}: same-day ledger load/save missing`);
  assert(/firstFreshVariant\(/.test(s)&&/remainingQuestionsAreFresh\(/.test(s),`${file}: fresh question-set selection missing`);
  assert(/dailySeen\.missions\[missionId\]=\[\.\.\.seenProblems\]/.test(s),`${file}: displayed question is not persisted to same-day ledger`);
  assert(/dailySeen\.missions\?\.\[missionId\]/.test(s),`${file}: reopened mission does not restore same-day shown questions`);
}
console.log('DAILY_QUEST_SAME_DAY_REPEAT_GUARD_OK');
