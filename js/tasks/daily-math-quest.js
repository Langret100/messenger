/*
 * 일일 수학 퀘스트
 * 5개 수학 미션을 매일 사용자별로 고정 생성하고, 각 5문제 완료 시 도장을 저장합니다.
 */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.DailyMathQuest = (() => {
  const STORAGE_KEY = "tasks.dailyMathQuest";
  const QUESTIONS_PER_MISSION = 5;
  const MISSIONS = [
    { id: "addition", icon: "+", title: "덧셈", description: "세 자리 수까지 더하기" },
    { id: "subtraction", icon: "−", title: "뺄셈", description: "큰 수에서 작은 수 빼기" },
    { id: "multiplication", icon: "×", title: "곱셈", description: "2~9단 곱셈" },
    { id: "division", icon: "÷", title: "나눗셈", description: "나머지 없는 나눗셈" },
    { id: "fraction", icon: "½", title: "분수", description: "약분과 분수의 덧셈·뺄셈" }
  ];

  function dateKey(date) {
    const current=date||new Date();
    return MiniTalk.Tasks.DailyQuestClock.dateKey(current);
  }

  function userId() {
    return MiniTalk.Store.get("user")?.user_id || "guest";
  }

  function emptyProgress() {
    return {
      date: dateKey(),
      userId: userId(),
      correct: Object.fromEntries(MISSIONS.map(mission => [mission.id, 0])),
      completed: {},
      updatedAt: 0
    };
  }

  function loadProgress() {
    const saved = MiniTalk.Persistence.get(STORAGE_KEY, null);
    if (!saved || saved.date !== dateKey() || saved.userId !== userId()) return emptyProgress();
    const progress = emptyProgress();
    MISSIONS.forEach(mission => {
      progress.correct[mission.id] = Math.min(
        QUESTIONS_PER_MISSION,
        Math.max(0, Math.floor(Number(saved.correct?.[mission.id]) || 0))
      );
      progress.completed[mission.id] = saved.completed?.[mission.id] === true;
    });
    progress.updatedAt = Number(saved.updatedAt) || 0;
    return progress;
  }

  function cloudPath(progress=loadProgress()){const key=String(progress.userId||userId()).replace(/[.#$\[\]\/]/g,"_");return `moaru/v3/questProgress/${key}/math/${progress.date}`}
  function mergeProgress(base,incoming){
    const next={...base,date:base.date,userId:base.userId,correct:{...(base.correct||{})},completed:{...(base.completed||{})}};
    MISSIONS.forEach(m=>{next.correct[m.id]=Math.min(QUESTIONS_PER_MISSION,Math.max(Number(base.correct?.[m.id])||0,Number(incoming?.correct?.[m.id])||0));next.completed[m.id]=base.completed?.[m.id]===true||incoming?.completed?.[m.id]===true});
    next.updatedAt=Math.max(Number(base.updatedAt)||0,Number(incoming?.updatedAt)||0);return next
  }
  function saveProgress(progress, options = {}) {
    progress.updatedAt=Date.now();MiniTalk.Persistence.set(STORAGE_KEY, progress);MiniTalk.Store.set("dailyQuest", progress);
    if(progress.userId!=="guest")MiniTalk.Realtime?.cloudTransaction?.(cloudPath(progress),remote=>{
      if(options.replaceCloud===true)return progress;
      if(!remote||remote.date!==progress.date||remote.userId!==progress.userId)return progress;
      return mergeProgress(progress,remote);
    }).catch(error=>console.warn("수학 퀘스트 서버 동기화 실패",error));
  }
  let lastSyncKey="",lastSyncAt=0;
  async function syncProgress(onProgress){const local=loadProgress(),key=cloudPath(local);if(local.userId==="guest"||key===lastSyncKey&&Date.now()-lastSyncAt<30000)return;lastSyncKey=key;lastSyncAt=Date.now();try{const remote=await MiniTalk.Realtime?.cloudGet?.(key,null);if(!remote||remote.date!==local.date||remote.userId!==local.userId)return;const merged=mergeProgress(local,remote);const changed=JSON.stringify({correct:merged.correct,completed:merged.completed})!==JSON.stringify({correct:local.correct,completed:local.completed});if(changed){MiniTalk.Persistence.set(STORAGE_KEY,merged);MiniTalk.Store.set("dailyQuest",merged);onProgress?.()}}catch(error){console.warn("수학 퀘스트 진행 불러오기 실패",error)}}

  function hash(text) {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function between(rng, minimum, maximum) {
    return minimum + Math.floor(rng() * (maximum - minimum + 1));
  }

  function generate(missionId, variant = 0) {
    const rng = random(hash(`${dateKey()}|${userId()}|${missionId}|${variant}`));
    const items = [];
    const seen = new Set();
    let guard = 0;
    while (items.length < QUESTIONS_PER_MISSION && guard < 100) {
      guard += 1;
      const item = problem(missionId, rng);
      const key = `${item.question}|${item.answer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    return items;
  }

  function gcd(left, right) {
    let a = Math.abs(left), b = Math.abs(right);
    while (b) [a, b] = [b, a % b];
    return a || 1;
  }

  function reducedFraction(numerator, denominator) {
    const divisor = gcd(numerator, denominator);
    return `${numerator / divisor}/${denominator / divisor}`;
  }

  function problem(missionId, rng) {
    if (missionId === "addition") {
      const left = between(rng, 10, 700);
      const right = between(rng, 10, 999 - left);
      return { question: `${left} + ${right} = ?`, answer: String(left + right), inputMode: "numeric" };
    }
    if (missionId === "subtraction") {
      const left = between(rng, 20, 999);
      const right = between(rng, 1, left);
      return { question: `${left} − ${right} = ?`, answer: String(left - right), inputMode: "numeric" };
    }
    if (missionId === "multiplication") {
      const left = between(rng, 2, 9);
      const right = between(rng, 1, 9);
      return { question: `${left} × ${right} = ?`, answer: String(left * right), inputMode: "numeric" };
    }
    if (missionId === "division") {
      const divisor = between(rng, 2, 9);
      const quotient = between(rng, 1, 9);
      return { question: `${divisor * quotient} ÷ ${divisor} = ?`, answer: String(quotient), inputMode: "numeric" };
    }
    const mode = between(rng, 0, 3);
    if (mode === 0) {
      const denominator = between(rng, 4, 12);
      const numerator = between(rng, 1, denominator - 1);
      const factor = between(rng, 2, 5);
      return {
        question: `전체 ${denominator * factor}칸 중 ${numerator * factor}칸을 색칠했습니다. 색칠한 부분을 기약분수로 나타내세요.`,
        answer: reducedFraction(numerator, denominator),
        inputMode: "text"
      };
    }
    if (mode === 1) {
      const denominator = between(rng, 6, 12);
      const left = between(rng, 1, denominator - 3);
      const right = between(rng, 1, denominator - left - 1);
      return {
        question: `${left}/${denominator} + ${right}/${denominator}을 계산해 기약분수로 나타내세요.`,
        answer: reducedFraction(left + right, denominator),
        inputMode: "text"
      };
    }
    if (mode === 2) {
      const denominator = between(rng, 6, 12);
      const left = between(rng, 3, denominator - 1);
      const right = between(rng, 1, left - 1);
      return {
        question: `${left}/${denominator} − ${right}/${denominator}을 계산해 기약분수로 나타내세요.`,
        answer: reducedFraction(left - right, denominator),
        inputMode: "text"
      };
    }
    const denominator = between(rng, 4, 12);
    const numerator = between(rng, 1, denominator - 1);
    const factor = between(rng, 2, 6);
    return {
      question: `구슬 ${denominator * factor}개 중 ${numerator * factor}개가 파란색입니다. 파란 구슬이 전체의 얼마인지 기약분수로 나타내세요.`,
      answer: reducedFraction(numerator, denominator),
      inputMode: "text"
    };
  }

  function correctPosition(missionId, questionIndex = 0, variant = 0) {
    const rng = random(hash(`${dateKey()}|${userId()}|${missionId}|${variant}|answer-positions`));
    const positions = [];
    while (positions.length <= questionIndex) {
      const cycle = [0, 1, 2, 3];
      for (let index = cycle.length - 1; index > 0; index -= 1) {
        const target = Math.floor(rng() * (index + 1));
        [cycle[index], cycle[target]] = [cycle[target], cycle[index]];
      }
      if (positions.length && cycle[0] === positions[positions.length - 1]) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
      positions.push(...cycle);
    }
    return positions[questionIndex];
  }

  /* 정답 하나와 겹치지 않는 오답 세 개를 만들고, 정답 칸은 문제마다 바뀌도록 배치합니다. */
  function choices(problemItem, missionId, questionIndex = 0, variant = 0) {
    const rng = random(hash(`${dateKey()}|${userId()}|${missionId}|${questionIndex}|${variant}|choices`));
    const values = new Set([problemItem.answer]);
    if (missionId === "fraction") {
      const [numerator, denominator] = problemItem.answer.split("/").map(Number);
      const candidates = [
        `${Math.max(1, numerator - 1)}/${denominator}`,
        `${Math.min(denominator, numerator + 1)}/${denominator}`,
        `${denominator}/${numerator}`,
        `${numerator}/${denominator + 1}`,
        `${numerator + 1}/${denominator + 1}`
      ];
      candidates.forEach(value => {
        if (values.size < 4 && value !== problemItem.answer) values.add(value);
      });
      while (values.size < 4) values.add(`${numerator}/${denominator + values.size}`);
    } else {
      const answer = Number(problemItem.answer);
      const step = answer >= 100 ? 10 : answer >= 20 ? 5 : 1;
      const candidates = [answer - step, answer + step, answer - 1, answer + 1, answer + step * 2, answer - step * 2];
      candidates.forEach(value => {
        if (values.size < 4 && value >= 0 && value !== answer) values.add(String(value));
      });
      while (values.size < 4) values.add(String(answer + values.size + 1));
    }
    const distractors = [...values].filter(value => value !== problemItem.answer);
    for (let index = distractors.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      [distractors[index], distractors[target]] = [distractors[target], distractors[index]];
    }
    const positioned = distractors.slice(0, 3);
    positioned.splice(correctPosition(missionId, questionIndex, variant), 0, problemItem.answer);
    return positioned;
  }

  function problemKey(item) {
    return `${item?.question || ""}|${item?.answer || ""}`;
  }

  function nextVariant(missionId, questionIndex, currentItem, currentVariant) {
    const currentPosition = correctPosition(missionId, questionIndex, currentVariant);
    let candidate = Math.max(0, Number(currentVariant) || 0) + 1;
    for (let guard = 0; guard < 64; guard += 1, candidate += 1) {
      const items = generate(missionId, candidate);
      const nextItem = items[questionIndex];
      if (nextItem && problemKey(nextItem) !== problemKey(currentItem) && correctPosition(missionId, questionIndex, candidate) !== currentPosition) return candidate;
    }
    return candidate;
  }

  function render(onProgress) {
    const D = MiniTalk.UI.Dom;
    const guest = Boolean(MiniTalk.Store.get("user")?.isGuest);
    const progress = loadProgress();
    syncProgress(onProgress);
    const completedCount = MISSIONS.filter(mission => progress.completed[mission.id]).length;
    const grid = D.el("div", { class: "daily-quest-grid" });

    if (!guest && completedCount === MISSIONS.length) {
      MiniTalk.Economy.QuestReward?.ensure("math", progress.date);
    }

    MISSIONS.forEach(mission => {
      const count = progress.correct[mission.id] || 0;
      const done = progress.completed[mission.id] === true;
      const card = D.el("button", {
        class: `daily-quest-card ${done ? "completed" : ""}`,
        type: "button",
        "aria-disabled": done || guest ? "true" : "false",
        ...(done || guest ? { disabled: true } : {}),
        onclick: done || guest ? null : () => openMission(mission.id, onProgress)
      }, [
        D.el("span", { class: "quest-operation", text: mission.icon }),
        D.el("span", { class: "quest-card-copy" }, [
          D.el("strong", { text: mission.title }),
          D.el("small", { class: "muted", text: done ? "완료됨" : guest ? "로그인 후 참여할 수 있어요" : mission.description }),
          D.el("span", { class: "quest-card-progress" }, [
            D.el("i", { style: `--quest-progress:${count / QUESTIONS_PER_MISSION * 100}%` }),
            D.el("b", { text: `${count}/${QUESTIONS_PER_MISSION}` })
          ])
        ])
      ]);
      if (done) card.append(D.el("img", { class: "quest-stamp", src: "assets/ui/quest-stamp.png", alt: "완료 도장" }));
      grid.append(card);
    });

    return MiniTalk.Tasks.QuestAccordion.wrap({
      subject: "math",
      icon: "123",
      title: "오늘의 수학 퀘스트",
      subtitle: "계산과 분수, 미션마다 5문제",
      completed: completedCount,
      total: MISSIONS.length,
      rewardCoin: 1,
      content: D.el("div", { class: "quest-daily-content" }, [MiniTalk.Tasks.DailyQuestClock.banner("수학"), grid])
    });
  }

  function openMission(missionId, onProgress) {
    if (MiniTalk.Store.get("user")?.isGuest) { MiniTalk.UI.Shell.toast("게스트는 과제를 볼 수만 있어요.");return; }
    const mission = MISSIONS.find(item => item.id === missionId);
    if (!mission) return;
    const D = MiniTalk.UI.Dom;
    const body = D.el("div", { class: "quest-solver modal-stack" });
    const progress = loadProgress();
    let variant = 0;
    let questions = generate(missionId, variant);
    let wrongCount = 0;

    function renderQuestion() {
      const index = progress.correct[missionId] || 0;
      body.replaceChildren();
      if (index >= QUESTIONS_PER_MISSION || progress.completed[missionId]) {
        renderComplete(body, mission);
        return;
      }

      const current = questions[index];
      const feedback = D.el("p", { class: "quest-feedback muted", "aria-live": "polite" });
      const choiceGrid = D.el("div", { class: "quest-choice-grid", role: "group", "aria-label": "정답 보기" });
      let answerLocked = false;

      async function submit(answer, selected) {
        if (answerLocked) return;
        answerLocked = true;
        D.all(".quest-choice", choiceGrid).forEach(button => { button.disabled = true; });

        if (answer !== current.answer) {
          selected.classList.add("wrong");
          wrongCount += 1;
          if (wrongCount >= 2) {
            progress.correct[missionId] = 0;
            progress.completed[missionId] = false;
            saveProgress(progress, { replaceCloud: true });
            feedback.textContent = "오답이 2개가 되어 이 미션을 0/5부터 다시 시작해요.";
            feedback.className = "quest-feedback wrong";
            setTimeout(() => {
              MiniTalk.UI.Shell.closeModal();
              onProgress?.();
              MiniTalk.UI.Shell.toast(`${mission.title} 미션을 다시 시작해요.`);
            }, 520);
            return;
          }
          feedback.textContent = "아쉬워요. 새 문제로 바꿀게요. 한 번 더 틀리면 이 미션은 다시 시작해요.";
          feedback.className = "quest-feedback wrong";
          const next = nextVariant(missionId, index, current, variant);
          variant = next;
          questions = generate(missionId, variant);
          setTimeout(renderQuestion, 520);
          return;
        }

        selected.classList.add("correct");
        progress.correct[missionId] = index + 1;
        if (progress.correct[missionId] >= QUESTIONS_PER_MISSION) progress.completed[missionId] = true;
        saveProgress(progress);
        if (progress.completed[missionId] === true) onProgress?.();
        if (MISSIONS.every(item => progress.completed[item.id])) MiniTalk.Events.emit("quest:subject-complete", { subject: "math", date: progress.date, userId: progress.userId });
        const missionFinished = progress.completed[missionId] === true;
        MiniTalk.Tasks.QuestAccordion.celebrate(body, () => {
          if (!missionFinished) return renderQuestion();
          MiniTalk.UI.Shell.closeModal();
          MiniTalk.UI.Shell.toast("도장을 받았어요!");
        });
      }

      choices(current, missionId, index, variant).forEach(answer => {
        const choice = D.el("button", { class: "quest-choice", type: "button", text: answer });
        choice.onclick = () => submit(answer, choice);
        choiceGrid.append(choice);
      });
      body.append(
        D.el("div", { class: "quest-solver-progress" }, [
          D.el("span", { text: `${mission.icon} ${mission.title}` }),
          D.el("strong", { text: `${index + 1} / ${QUESTIONS_PER_MISSION}` })
        ]),
        D.el("div", { class: "quest-question", text: current.question }),
        D.el("small", { class: "muted", text: `아래 보기에서 정답을 골라보세요. · 오답 ${wrongCount}/2` }),
        choiceGrid,
        feedback
      );
      setTimeout(() => choiceGrid.querySelector(".quest-choice")?.focus(), 30);
    }

    MiniTalk.UI.Shell.modal(`${mission.title} 미션`, body);
    renderQuestion();
  }

  function renderComplete(body, mission) {
    const D = MiniTalk.UI.Dom;
    body.append(
      D.el("img", { class: "quest-complete-stamp", src: "assets/ui/quest-stamp.png", alt: "퀘스트 완료 도장" }),
      D.el("h3", { text: `${mission.title} 미션 완료!` }),
      D.el("p", { class: "muted", text: "문제 5개를 모두 맞혀 오늘의 도장을 받았습니다." }),
      D.el("button", { class: "button primary", type: "button", text: "확인", onclick: () => MiniTalk.UI.Shell.closeModal() })
    );
  }

  function resetForTests() {
    MiniTalk.Persistence.remove(STORAGE_KEY);
  }

  return { render, generate, choices, loadProgress, dateKey, missions: () => MISSIONS.slice(), resetForTests };
})();
