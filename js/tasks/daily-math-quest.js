/*
 * 일일 수학 퀘스트
 * 초등 3학년 범위의 5개 미션을 매일 사용자별로 고정 생성하고, 각 5문제 완료 시 도장을 저장합니다.
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
    { id: "fraction", icon: "½", title: "분수", description: "전체 중 일부를 분수로 쓰기" }
  ];

  function dateKey(date = new Date()) {
    return MiniTalk.Tasks.DailyQuestClock.dateKey(date);
  }

  function userId() {
    return MiniTalk.Store.get("user")?.user_id || "guest";
  }

  function emptyProgress() {
    return {
      date: dateKey(),
      userId: userId(),
      correct: Object.fromEntries(MISSIONS.map(mission => [mission.id, 0])),
      completed: {}
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
    return progress;
  }

  function saveProgress(progress) {
    MiniTalk.Persistence.set(STORAGE_KEY, progress);
    MiniTalk.Store.set("dailyQuest", progress);
  }

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

  function generate(missionId) {
    const rng = random(hash(`${dateKey()}|${userId()}|${missionId}`));
    return Array.from({ length: QUESTIONS_PER_MISSION }, () => problem(missionId, rng));
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
    const denominator = between(rng, 2, 10);
    const numerator = between(rng, 1, denominator - 1);
    return {
      question: `전체를 ${denominator}등분해 ${numerator}조각을 색칠했습니다. 분수로 쓰세요.`,
      answer: `${numerator}/${denominator}`,
      inputMode: "text"
    };
  }

  /* 정답 하나와 겹치지 않는 오답 세 개를 문제별로 고정 생성합니다. */
  function choices(problemItem, missionId, questionIndex = 0) {
    const rng = random(hash(`${dateKey()}|${userId()}|${missionId}|${questionIndex}|choices`));
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
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
  }

  function render(onProgress) {
    const D = MiniTalk.UI.Dom;
    const progress = loadProgress();
    const completedCount = MISSIONS.filter(mission => progress.completed[mission.id]).length;
    const grid = D.el("div", { class: "daily-quest-grid" });

    if (completedCount === MISSIONS.length) {
      MiniTalk.Economy.QuestReward?.ensure("math", progress.date);
    }

    MISSIONS.forEach(mission => {
      const count = progress.correct[mission.id] || 0;
      const done = progress.completed[mission.id] === true;
      const card = D.el("button", {
        class: `daily-quest-card ${done ? "completed" : ""}`,
        type: "button",
        "aria-disabled": done ? "true" : "false",
        ...(done ? { disabled: true } : {}),
        onclick: done ? null : () => openMission(mission.id, onProgress)
      }, [
        D.el("span", { class: "quest-operation", text: mission.icon }),
        D.el("span", { class: "quest-card-copy" }, [
          D.el("strong", { text: mission.title }),
          D.el("small", { class: "muted", text: done ? "완료됨" : mission.description }),
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
      icon: "∑",
      title: "오늘의 수학 퀘스트",
      subtitle: "계산과 분수, 미션마다 5문제",
      completed: completedCount,
      total: MISSIONS.length,
      content: D.el("div", { class: "quest-daily-content" }, [MiniTalk.Tasks.DailyQuestClock.banner("수학"), grid])
    });
  }

  function openMission(missionId, onProgress) {
    const mission = MISSIONS.find(item => item.id === missionId);
    if (!mission) return;
    const D = MiniTalk.UI.Dom;
    const body = D.el("div", { class: "quest-solver modal-stack" });
    const questions = generate(missionId);
    const progress = loadProgress();

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

      async function submit(answer, selected) {
        if (answer !== current.answer) {
          feedback.textContent = "아직 아니에요. 다시 계산해 보세요.";
          feedback.className = "quest-feedback wrong";
          selected.classList.add("wrong");
          selected.disabled = true;
          return;
        }

        D.all(".quest-choice", choiceGrid).forEach(button => { button.disabled = true; });
        selected.classList.add("correct");
        progress.correct[missionId] = index + 1;
        if (progress.correct[missionId] >= QUESTIONS_PER_MISSION) {
          progress.completed[missionId] = true;
        }
        saveProgress(progress);
        onProgress?.();
        if (MISSIONS.every(item => progress.completed[item.id])) MiniTalk.Events.emit("quest:subject-complete", { subject: "math", date: progress.date, userId: progress.userId });
        const missionFinished = progress.completed[missionId] === true;
        MiniTalk.Tasks.QuestAccordion.celebrate(body, () => {
          if (!missionFinished) return renderQuestion();
          MiniTalk.UI.Shell.closeModal();
          MiniTalk.UI.Shell.toast("도장을 받았어요!");
        });
      }

      choices(current, missionId, index).forEach(answer => {
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
        D.el("small", { class: "muted", text: "아래 보기에서 정답을 골라보세요." }),
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
