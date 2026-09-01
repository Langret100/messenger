/*
 * 오늘의 국어 퀘스트
 * 맞춤법·표현·띄어쓰기·문장부호·접속사 문제를 사용자와 날짜별로 5문제씩 고정합니다.
 */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.DailyKoreanQuest = (() => {
  const STORAGE_KEY = "tasks.dailyKoreanQuest";
  const QUESTIONS_PER_MISSION = 5;
  const MISSIONS = [
    { id: "spelling", icon: "가", title: "맞춤법", description: "바르게 쓴 낱말 찾기" },
    { id: "expression", icon: "말", title: "알맞은 표현", description: "빈칸에 어울리는 말" },
    { id: "spacing", icon: "띄", title: "띄어쓰기", description: "문장을 바르게 띄어 쓰기" },
    { id: "punctuation", icon: "!", title: "문장부호", description: "문장에 알맞은 부호" },
    { id: "conjunction", icon: "잇", title: "접속사", description: "문장을 자연스럽게 잇기" }
  ];

  const BANK = {
    spelling: [
      ["다음 중 맞춤법이 바른 것은?", "웬일이야", ["왠일이야", "웬일이야", "왠 일이야", "웬 일이야"]],
      ["빈칸에 알맞은 말은? 다음 주에 다시 ___", "뵐게요", ["봴게요", "뵐께요", "뵐게요", "봴께요"]],
      ["다음 중 맞춤법이 바른 것은?", "며칠", ["몇일", "몃일", "며칠", "몇 칠"]],
      ["다음 중 맞춤법이 바른 것은?", "금세", ["금새", "금세", "금 쎄", "금쌔"]],
      ["빈칸에 알맞은 말은? 숙제를 모두 ___", "마쳤다", ["맞쳤다", "마쳤다", "마치엇다", "맏쳤다"]],
      ["다음 중 바르게 쓴 낱말은?", "깨끗이", ["깨끗히", "깨끗이", "깨끄시", "깨끗 리"]],
      ["빈칸에 알맞은 말은? 감기가 빨리 ___", "나았다", ["낳았다", "나았다", "낫았다", "낮았다"]],
      ["빈칸에 알맞은 말은? 이 문제를 ___ 풀었니?", "어떻게", ["어떡해", "어떻게", "어떻해", "어떡게"]]
    ],
    expression: [
      ["비가 올 것 같아서 우산을 ___.", "챙겼다", ["접었다", "챙겼다", "잊었다", "숨겼다"]],
      ["친구의 이야기에 귀를 ___.", "기울였다", ["가렸다", "기울였다", "막았다", "돌렸다"]],
      ["모르는 낱말을 사전에서 ___.", "찾아보았다", ["지워 보았다", "찾아보았다", "접어 보았다", "그려 보았다"]],
      ["운동을 마치고 물을 ___.", "마셨다", ["입었다", "마셨다", "걸었다", "들었다"]],
      ["발표 전에 숨을 크게 ___.", "들이마셨다", ["건너뛰었다", "들이마셨다", "내려놓았다", "밀어냈다"]],
      ["약속 시간을 꼭 ___.", "지켜야 한다", ["감춰야 한다", "지켜야 한다", "미뤄야 한다", "잊어야 한다"]],
      ["넘어진 동생을 일으켜 ___.", "주었다", ["주었다", "버렸다", "감췄다", "막았다"]],
      ["도서관에서는 작은 목소리로 ___.", "말해야 한다", ["뛰어야 한다", "말해야 한다", "노래해야 한다", "외쳐야 한다"]]
    ],
    spacing: [
      ["띄어쓰기가 바른 문장은?", "나는 할 수 있다.", ["나는 할수 있다.", "나는할 수 있다.", "나는 할 수 있다.", "나는 할 수있다."]],
      ["띄어쓰기가 바른 것은?", "한 번 더", ["한번 더", "한 번더", "한 번 더", "한번더"]],
      ["띄어쓰기가 바른 문장은?", "책상 위에 연필이 있다.", ["책상위에 연필이 있다.", "책상 위에연필이 있다.", "책상 위에 연필이 있다.", "책상위에연필이 있다."]],
      ["띄어쓰기가 바른 것은?", "집에 가는 길", ["집에가는 길", "집에 가는길", "집에 가는 길", "집에가는길"]],
      ["띄어쓰기가 바른 문장은?", "밥을 먹고 나서 놀았다.", ["밥을먹고 나서 놀았다.", "밥을 먹고나서 놀았다.", "밥을 먹고 나서 놀았다.", "밥을먹고나서 놀았다."]],
      ["띄어쓰기가 바른 것은?", "할머니 댁", ["할머니댁", "할머니 댁", "할 머니 댁", "할머니  댁"]],
      ["띄어쓰기가 바른 문장은?", "내일 아침에 만나자.", ["내일아침에 만나자.", "내일 아침에만나자.", "내일 아침에 만나자.", "내일아침에만나자."]],
      ["띄어쓰기가 바른 것은?", "두 사람", ["두사람", "두 사람", "두  사람", "둘 사람"]]
    ],
    punctuation: [
      ["기쁜 마음을 나타내는 문장은?", "우아, 정말 멋지다!", ["우아, 정말 멋지다.", "우아, 정말 멋지다?", "우아, 정말 멋지다!", "우아 정말, 멋지다"]],
      ["묻는 문장에 알맞은 것은?", "오늘 같이 갈래?", ["오늘 같이 갈래.", "오늘 같이 갈래!", "오늘 같이 갈래?", "오늘, 같이 갈래."]],
      ["말한 내용을 나타내는 문장은?", "민지가 말했다. “고마워.”", ["민지가 말했다? 고마워.", "민지가 말했다. “고마워.”", "민지가 말했다! 고마워?", "민지가, 말했다 고마워."]],
      ["쉼표를 바르게 사용한 문장은?", "사과, 배, 포도를 샀다.", ["사과 배 포도를, 샀다.", "사과, 배, 포도를 샀다.", "사과 배, 포도,를 샀다.", "사과 배 포도를 샀다,"]],
      ["문장을 마치는 부호가 바른 것은?", "나는 학교에 간다.", ["나는 학교에 간다?", "나는 학교에 간다,", "나는 학교에 간다.", "나는 학교에 간다!"]],
      ["놀람을 나타내는 문장은?", "앗, 뜨거워!", ["앗, 뜨거워.", "앗 뜨거워?", "앗, 뜨거워!", "앗. 뜨거워,"]],
      ["부르는 말을 바르게 나타낸 것은?", "지민아, 이쪽으로 와.", ["지민아 이쪽으로, 와.", "지민아, 이쪽으로 와.", "지민아. 이쪽으로 와?", "지민아 이쪽으로 와,"]],
      ["제목을 나타내는 문장부호가 바른 것은?", "나는 『어린 왕자』를 읽었다.", ["나는, 어린 왕자를 읽었다.", "나는 『어린 왕자』를 읽었다.", "나는? 어린 왕자를 읽었다.", "나는 어린 왕자! 를 읽었다."]]
    ],
    conjunction: [
      ["비가 왔다. ___ 우산을 썼다.", "그래서", ["하지만", "그래서", "또는", "그러나"]],
      ["열심히 연습했다. ___ 경기에서 졌다.", "하지만", ["그래서", "그리고", "하지만", "그러므로"]],
      ["나는 책을 읽었다. ___ 독후감을 썼다.", "그리고", ["그러나", "왜냐하면", "그리고", "또는"]],
      ["연필 ___ 볼펜으로 쓰세요.", "또는", ["그래서", "하지만", "또는", "왜냐하면"]],
      ["일찍 잤다. ___ 아침에 개운했다.", "그래서", ["그래서", "그러나", "또는", "하지만"]],
      ["밖에 나가지 않았다. ___ 비가 많이 왔기 때문이다.", "왜냐하면", ["그리고", "하지만", "또는", "왜냐하면"]],
      ["동생은 매운 음식을 좋아한다. ___ 나는 좋아하지 않는다.", "반면에", ["그래서", "반면에", "그리고", "그러므로"]],
      ["손을 씻었다. ___ 식탁에 앉았다.", "그다음", ["하지만", "왜냐하면", "그다음", "또는"]]
    ]
  };

  function dateKey(date) {
    const current=date||new Date();
    return MiniTalk.Tasks.DailyQuestClock.dateKey(current);
  }
  const userId = () => MiniTalk.Store.get("user")?.user_id || "guest";
  function hash(text) { let value = 2166136261; for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); } return value >>> 0; }
  function random(seed) { let state = seed >>> 0; return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
  function correctPosition(missionId, questionIndex = 0, variant = 0) { const rng=random(hash(`${dateKey()}|${userId()}|${missionId}|${variant}|answer-positions`)),positions=[];while(positions.length<=questionIndex){const cycle=[0,1,2,3];for(let i=cycle.length-1;i>0;i-=1){const j=Math.floor(rng()*(i+1));[cycle[i],cycle[j]]=[cycle[j],cycle[i]]}if(positions.length&&cycle[0]===positions[positions.length-1])[cycle[0],cycle[1]]=[cycle[1],cycle[0]];positions.push(...cycle)}return positions[questionIndex]}
  function positionChoices(item,missionId,questionIndex,variant=0){const rng=random(hash(`${dateKey()}|${userId()}|${missionId}|${questionIndex}|${variant}|korean-choices`)),wrong=item.choices.filter(value=>value!==item.answer);for(let i=wrong.length-1;i>0;i-=1){const j=Math.floor(rng()*(i+1));[wrong[i],wrong[j]]=[wrong[j],wrong[i]]}const choices=wrong.slice(0,3);choices.splice(correctPosition(missionId,questionIndex,variant),0,item.answer);return {...item,choices}}
  function emptyProgress() { return { date: dateKey(), userId: userId(), correct: Object.fromEntries(MISSIONS.map(item => [item.id, 0])), completed: {}, attempts: Object.fromEntries(MISSIONS.map(item => [item.id, 0])), updatedAt: 0 }; }
  function loadProgress() { const saved = MiniTalk.Persistence.get(STORAGE_KEY, null), progress = emptyProgress(); if (!saved || saved.date !== progress.date || saved.userId !== progress.userId) return progress; MISSIONS.forEach(item => { progress.correct[item.id] = Math.min(5, Math.max(0, Math.floor(Number(saved.correct?.[item.id]) || 0))); progress.completed[item.id] = saved.completed?.[item.id] === true; progress.attempts[item.id]=Math.max(0,Math.floor(Number(saved.attempts?.[item.id])||0)); }); progress.updatedAt=Number(saved.updatedAt)||0;return progress; }
  function cloudPath(progress=loadProgress()){const key=String(progress.userId||userId()).replace(/[.#$\[\]\/]/g,"_");return `moaru/v3/questProgress/${key}/korean/${progress.date}`}
  function mergeProgress(base,incoming){const next={...base,date:base.date,userId:base.userId,correct:{...(base.correct||{})},completed:{...(base.completed||{})},attempts:{...(base.attempts||{})}};MISSIONS.forEach(m=>{next.correct[m.id]=Math.min(QUESTIONS_PER_MISSION,Math.max(Number(base.correct?.[m.id])||0,Number(incoming?.correct?.[m.id])||0));next.completed[m.id]=base.completed?.[m.id]===true||incoming?.completed?.[m.id]===true;next.attempts[m.id]=Math.max(Number(base.attempts?.[m.id])||0,Number(incoming?.attempts?.[m.id])||0)});next.updatedAt=Math.max(Number(base.updatedAt)||0,Number(incoming?.updatedAt)||0);return next}
  function saveProgress(progress,options={}) { progress.updatedAt=Date.now();MiniTalk.Persistence.set(STORAGE_KEY, progress); MiniTalk.Store.set("dailyKoreanQuest", progress);if(progress.userId!=="guest")MiniTalk.Realtime?.cloudTransaction?.(cloudPath(progress),remote=>{if(options.replaceCloud===true)return progress;if(!remote||remote.date!==progress.date||remote.userId!==progress.userId)return progress;return mergeProgress(progress,remote)}).catch(error=>console.warn("국어 퀘스트 서버 동기화 실패",error)); }
  let lastSyncKey="",lastSyncAt=0;async function syncProgress(onProgress){const local=loadProgress(),key=cloudPath(local);if(local.userId==="guest"||key===lastSyncKey&&Date.now()-lastSyncAt<30000)return;lastSyncKey=key;lastSyncAt=Date.now();try{const remote=await MiniTalk.Realtime?.cloudGet?.(key,null);if(!remote||remote.date!==local.date||remote.userId!==local.userId)return;const merged=mergeProgress(local,remote),changed=JSON.stringify({correct:merged.correct,completed:merged.completed,attempts:merged.attempts})!==JSON.stringify({correct:local.correct,completed:local.completed,attempts:local.attempts});if(changed){MiniTalk.Persistence.set(STORAGE_KEY,merged);MiniTalk.Store.set("dailyKoreanQuest",merged);onProgress?.()}}catch(error){console.warn("국어 퀘스트 진행 불러오기 실패",error)}}
  function formatQuestion(raw) {
    const separator = raw.indexOf("? ");
    if (separator > -1) {
      const guide = raw.slice(0, separator + 1);
      return {
        instruction: guide.startsWith("빈칸에") ? "빈칸에 들어갈 알맞은 말을 고르세요." : guide,
        question: raw.slice(separator + 2)
      };
    }
    return { instruction: "문제를 읽고 가장 알맞은 답을 고르세요.", question: raw };
  }
  function generate(missionId, variant = 0) { const items = (BANK[missionId] || []).map(([raw, answer, choices]) => ({ ...formatQuestion(raw), answer, choices: choices.slice() })); const rng = random(hash(`${dateKey()}|${userId()}|${missionId}|korean|${variant}`)); for (let i = items.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items.slice(0, QUESTIONS_PER_MISSION).map((item,index)=>positionChoices(item,missionId,index,variant)); }

  function problemKey(item){return `${item?.instruction||""}|${item?.question||""}|${item?.answer||""}`}
  function nextVariant(missionId,questionIndex,currentItem,currentVariant){const currentPosition=correctPosition(missionId,questionIndex,currentVariant);let candidate=Math.max(0,Number(currentVariant)||0)+1;for(let guard=0;guard<64;guard+=1,candidate+=1){const items=generate(missionId,candidate),nextItem=items[questionIndex];if(nextItem&&problemKey(nextItem)!==problemKey(currentItem)&&correctPosition(missionId,questionIndex,candidate)!==currentPosition)return candidate}return candidate}

  function render(onProgress) {
    const D = MiniTalk.UI.Dom, guest = Boolean(MiniTalk.Store.get("user")?.isGuest), progress = loadProgress(), grid = D.el("div", { class: "daily-quest-grid" });syncProgress(onProgress);
    const completedCount = MISSIONS.filter(item => progress.completed[item.id]).length;
    if (!guest && completedCount === MISSIONS.length) MiniTalk.Economy.QuestReward?.ensure("korean", progress.date);
    MISSIONS.forEach(mission => {
      const count = progress.correct[mission.id] || 0, done = progress.completed[mission.id] === true;
      const card = D.el("button", { class: `daily-quest-card ${done ? "completed" : ""}`, type: "button", "aria-disabled": done || guest ? "true" : "false", ...(done || guest ? { disabled: true } : {}), onclick: done || guest ? null : () => openMission(mission.id, onProgress) }, [
        D.el("span", { class: "quest-operation", text: mission.icon }),
        D.el("span", { class: "quest-card-copy" }, [D.el("strong", { text: mission.title }), D.el("small", { class: "muted", text: done ? "완료됨" : guest ? "로그인 후 참여할 수 있어요" : mission.description }), D.el("span", { class: "quest-card-progress" }, [D.el("i", { style: `--quest-progress:${count / 5 * 100}%` }), D.el("b", { text: `${count}/5` })])])
      ]);
      if (done) card.append(D.el("img", { class: "quest-stamp", src: "assets/ui/quest-stamp.png", alt: "완료 도장" }));
      grid.append(card);
    });
    return MiniTalk.Tasks.QuestAccordion.wrap({ subject: "korean", icon: "한", title: "오늘의 국어 퀘스트", subtitle: "맞춤법과 바른 문장 표현", completed: completedCount, total: MISSIONS.length, rewardCoin: 1, content: D.el("div", { class: "quest-daily-content" }, [MiniTalk.Tasks.DailyQuestClock.banner("국어"), grid]) });
  }

  function openMission(missionId, onProgress) {
    if (MiniTalk.Store.get("user")?.isGuest) { MiniTalk.UI.Shell.toast("게스트는 과제를 볼 수만 있어요.");return; }
    const mission = MISSIONS.find(item => item.id === missionId); if (!mission) return;
    const D = MiniTalk.UI.Dom, body = D.el("div", { class: "quest-solver modal-stack" }), progress = loadProgress();
    let variant=0,questions=generate(missionId,variant),wrongCount=0;
    function renderQuestion() {
      const index = progress.correct[missionId] || 0; body.replaceChildren();
      if (index >= 5 || progress.completed[missionId]) return renderComplete();
      const current = questions[index], feedback = D.el("p", { class: "quest-feedback muted", "aria-live": "polite" }), choiceGrid = D.el("div", { class: "quest-choice-grid korean-choice-grid", role: "group", "aria-label": "정답 보기" });
      let answerLocked=false;
      current.choices.forEach(answer => { const button = D.el("button", { class: "quest-choice korean-choice", type: "button", text: answer }); button.onclick = () => submit(answer, button); choiceGrid.append(button); });
      function submit(answer, selected) {
        if(answerLocked)return;answerLocked=true;D.all(".quest-choice",choiceGrid).forEach(button=>{button.disabled=true});
        if (answer !== current.answer) {
          selected.classList.add("wrong");wrongCount+=1;
          if(wrongCount>=2){progress.correct[missionId]=0;progress.completed[missionId]=false;saveProgress(progress,{replaceCloud:true});feedback.textContent="오답이 2개가 되어 이 미션을 0/5부터 다시 시작해요.";feedback.className="quest-feedback wrong";setTimeout(()=>{MiniTalk.UI.Shell.closeModal();onProgress?.();MiniTalk.UI.Shell.toast(`${mission.title} 미션을 다시 시작해요.`)},520);return;}
          feedback.textContent="아쉬워요. 새 문제로 바꿀게요. 한 번 더 틀리면 이 미션은 다시 시작해요.";feedback.className="quest-feedback wrong";variant=nextVariant(missionId,index,current,variant);questions=generate(missionId,variant);setTimeout(renderQuestion,520);return;
        }
        selected.classList.add("correct");progress.correct[missionId]=index+1;if(progress.correct[missionId]>=5)progress.completed[missionId]=true;
        saveProgress(progress); if (progress.completed[missionId] === true) onProgress?.(); if(MISSIONS.every(item=>progress.completed[item.id]))MiniTalk.Events.emit("quest:subject-complete",{subject:"korean",date:progress.date,userId:progress.userId});
        const missionFinished=progress.completed[missionId]===true;MiniTalk.Tasks.QuestAccordion.celebrate(body,()=>{if(!missionFinished)return renderQuestion();MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast("도장을 받았어요!")});
      }
      body.append(D.el("div",{class:"quest-solver-progress"},[D.el("span",{text:`국어 · ${mission.title}`}),D.el("strong",{text:`${index+1} / 5`})]),D.el("small",{class:"quest-instruction",text:current.instruction}),D.el("div",{class:"quest-question korean-question",text:current.question}),D.el("small",{class:"muted",text:`오답 ${wrongCount}/2 · 두 번째 오답이면 이 미션을 다시 시작해요.`}),choiceGrid,feedback);
      setTimeout(()=>choiceGrid.querySelector(".quest-choice")?.focus(),30);
    }
    function renderComplete(){body.append(D.el("img",{class:"quest-complete-stamp",src:"assets/ui/quest-stamp.png",alt:"퀘스트 완료 도장"}),D.el("h3",{text:`${mission.title} 미션 완료!`}),D.el("p",{class:"muted",text:"문제 5개를 모두 맞혀 오늘의 도장을 받았습니다."}),D.el("button",{class:"button primary",type:"button",text:"확인",onclick:()=>MiniTalk.UI.Shell.closeModal()}));}
    MiniTalk.UI.Shell.modal(`${mission.title} 미션`,body);renderQuestion();
  }

  function resetForTests() { MiniTalk.Persistence.remove(STORAGE_KEY); }
  return { render, generate, loadProgress, dateKey, missions: () => MISSIONS.slice(), resetForTests };
})();
