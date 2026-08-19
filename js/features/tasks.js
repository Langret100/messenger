/* 일일 국어·수학 퀘스트와 관리자 지정 제출형 과제를 구분해 표시합니다. */
MiniTalk.Features.Tasks = (() => {
  let tasks = {};

  MiniTalk.Events.on("rt:tasks", value => {
    tasks = value || {};
    MiniTalk.Store.set("tasks", tasks);
    if (MiniTalk.Store.get("route") === "tasks") render(MiniTalk.UI.Dom.byId("viewHost"));
  });

  function render(host) {
    if (!host) return;
    const D = MiniTalk.UI.Dom, guest = Boolean(MiniTalk.Store.get("user")?.isGuest), view = D.el("section", { class: "view task-center-view" }), list = D.el("div", { class: "card-list" }), assigned = D.el("section", { class: "assigned-tasks" }), assignedList = D.el("div", { class: "assigned-task-list" });
    const rows = Object.values(tasks).filter(task => MiniTalk.Tasks.TaskService?.visible?.(task) !== false).sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || Number(b.updatedAt || b.createdAt) - Number(a.updatedAt || a.createdAt));
    rows.forEach(task => assignedList.append(taskCard(task, host)));
    if (!rows.length) assignedList.append(D.el("div", { class: "empty-state compact-empty" }, [D.el("span", { text: "✓" }), D.el("strong", { text: guest ? "게스트는 과제를 볼 수만 있어요" : "받은 과제가 없어요" }), D.el("small", { class: "muted", text: guest ? "로그인하면 일일 퀘스트와 지정 과제에 참여할 수 있습니다." : "오늘의 수학·국어 퀘스트부터 도전해 보세요." })]));
    assigned.append(D.el("div", { class: "section-label" }, [D.el("strong", { text: "관리자 지정 과제" }), D.el("small", { class: "muted", text: `${rows.length}개 · 직접 제출하는 과제` })]), assignedList);
    list.append(MiniTalk.Tasks.FridayGrade6Mission.render(), MiniTalk.Tasks.DailyMathQuest.render(() => render(host)), MiniTalk.Tasks.DailyKoreanQuest.render(() => render(host)), assigned);view.append(list);host.replaceChildren(view);
  }

  const statusOrder = status => ({ retry: 0, open: 1, submitted: 2, completed: 3 }[status] ?? 4);
  function statusInfo(task) {
    if (task.status === "retry") return { label: "다시!", detail: task.feedback || "피드백을 확인하고 다시 제출해주세요.", className: "retry" };
    if (task.status === "submitted") return { label: "제출됨", detail: "관리자가 확인하고 있어요.", className: "submitted" };
    if (task.status === "completed") return { label: "완료", detail: `보상 🪙 +${task.rewardCoin || 0} · 완료 후 2일 동안 표시돼요.`, className: "completed" };
    return { label: "작성 전", detail: "눌러서 과제를 작성하고 제출하세요.", className: "open" };
  }

  function taskCard(task, host) {
    const D = MiniTalk.UI.Dom, info = statusInfo(task), actionText = task.status === "retry" ? "수정해서 다시 제출" : task.status === "submitted" ? "제출 내용 수정" : task.status === "completed" ? "완료된 과제" : "과제 작성";
    const card = D.el("article", { class: `task-card assigned-task-card status-${info.className}` }, [
      D.el("div", { class: "assigned-task-top" }, [D.el("span", { class: `task-status-badge ${info.className}`, text: info.label }), D.el("span", { class: "task-reward-pill", "aria-label": `완료 보상 ${Number(task.rewardCoin) || 0}코인` }, [D.el("img", { src: "assets/ui/notebook-coin.svg", alt: "" }), D.el("b", { text: `+${Number(task.rewardCoin) || 0}` })])]),
      D.el("strong", { class: "assigned-task-title", text: task.title || "과제" }),
      D.el("p", { class: "assigned-task-description", text: task.description || "과제 내용을 확인해주세요." }),
      task.status === "retry" ? D.el("div", { class: "task-feedback-inline" }, [D.el("b", { text: "관리자 피드백" }), D.el("span", { text: task.feedback })]) : null,
      D.el("div", { class: "assigned-task-foot" }, [D.el("small", { text: info.detail }), D.el("button", { class: "button primary compact-button", type: "button", text: actionText, disabled: task.status === "completed" })])
    ]);
    const button = D.one("button", card);
    if (task.status !== "completed") button.onclick = () => MiniTalk.Tasks.TaskWindow.openStudent(task, async (answer, imageData) => { await MiniTalk.Tasks.TaskService.submit(task.id, answer, imageData);MiniTalk.UI.Shell.toast("과제를 제출했습니다.");render(host); });
    return card;
  }

  return { id: "tasks", title: "과제", icon: "✓", render };
})();
MiniTalk.Registry.register(MiniTalk.Features.Tasks);
