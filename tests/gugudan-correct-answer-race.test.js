const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','games','gugudan.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('let activeRoundId = 0;'),'round id state missing');
ok(html.includes('let roundLocked = true;'),'round lock state missing');
ok(html.includes('const roundId = ++activeRoundId;'),'new question must create a fresh round id');
ok(html.includes('const roundAnswer = correctAnswer;'),'question answer must be snapshotted per round');
ok(html.includes('startTimer(currentLimit, roundId);'),'timer must be bound to the current round');
ok(html.includes('createBalls(answers, roundId, roundAnswer);'),'balls must be bound to round and answer snapshot');
ok(html.includes("ball.dataset.roundId = String(roundId);"),'ball round id missing');
ok(html.includes("ball.dataset.roundAnswer = String(roundAnswer);"),'ball answer snapshot missing');
ok(html.includes('if (isGameOver || roundLocked) return;'),'clicks must stop after first result');
ok(html.includes('if (!Number.isFinite(ballRoundId) || ballRoundId !== activeRoundId) return;'),'stale balls must be ignored');
ok(html.includes('const expectedAnswer = Number(ball.dataset.roundAnswer);'),'click must compare against ball round snapshot');
ok(html.includes('roundLocked = true;\n            clearInterval(timerInterval);\n            clearTimeout(questionTimeout);'),'first click must lock and cancel both timers before result handling');
ok(html.includes('!roundLocked && roundId === activeRoundId'),'timeout callbacks must verify round is still live');

// Model the edge race: correct click occurs just before both timer callbacks.
let score=0, gameOver=false, roundLocked=false, activeRoundId=7, timerActive=true, timeoutActive=true;
function endGame(){ if(gameOver)return; gameOver=true; }
function click(value,ballRoundId,expected){
  if(gameOver||roundLocked)return;
  if(ballRoundId!==activeRoundId)return;
  roundLocked=true; timerActive=false; timeoutActive=false;
  if(value===expected) score+=10; else endGame();
}
function timerFire(roundId){ if(timerActive && !gameOver && !roundLocked && roundId===activeRoundId){roundLocked=true;endGame();}}
function timeoutFire(roundId){ if(timeoutActive && !gameOver && !roundLocked && roundId===activeRoundId){roundLocked=true;endGame();}}
click(30,7,30); timerFire(7); timeoutFire(7);
ok(score===10,'6x5=30 correct click did not score');
ok(gameOver===false,'correct click was overwritten by late timer/timeout');
// stale old ball cannot answer a newer round
roundLocked=false; activeRoundId=8; click(30,7,30); ok(score===10,'stale previous-round ball was accepted');
console.log('GUGUDAN_CORRECT_ANSWER_RACE_OK');
